"""Helpers for sculpting battlefield miniatures in Blender, run headless.

Model scripts describe parts in the game's own space (metres, +Y up, facing +Z) so joint names
and pivots match the sculpted rig in src/app/game/battle-map/battlefield-models.ts. The game then
animates authored models exactly like sculpted ones (walk, swing, level-up hop). Geometry is
converted to Blender's Z-up as parts are made, and each joint's parts are merged into one mesh on
export so a joint draws in a single call once `npm run models:optimize` has run.

Usage from a model script:

    m = Miniature('blade-warden')
    torso = m.joint('torso', m.root, (0, 0.3, 0))
    m.sphere(0.05, STEEL, torso, at=(0, 0.2, 0))
    m.export()  # path comes from the command line, after `--`
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

# Game (x, y, z) -> Blender (x, -z, y): +Y up becomes +Z up, facing +Z becomes facing -Y
TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
TO_GAME = TO_BLENDER.inverted()
# Parts smaller than this (eyes' irises, rivets, brows) get no ink line, as on sculpted miniatures
MIN_INKED = 0.03


def rotation(rx=0.0, ry=0.0, rz=0.0):
    """Game-space Euler angles (three.js 'XYZ' order) as a Blender-space quaternion."""
    game = Euler((rx, ry, rz), 'ZYX').to_matrix()
    return (TO_BLENDER @ game @ TO_GAME).to_quaternion()


def linear(color):
    """sRGB hex to linear RGBA, which is how glTF stores base colours."""

    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (
        channel((color >> 16) & 255),
        channel((color >> 8) & 255),
        channel(color & 255),
        1.0,
    )


def segments_for(radius):
    """Segment count scaled to size, like the sculpted miniatures: rivets stay cheap."""
    return 8 if radius < 0.03 else 12 if radius < 0.09 else 20


def table(points, t):
    """Piecewise-linear lookup in [(t, value), ...] sorted by t (either direction)."""
    points = sorted(points)
    if t <= points[0][0]:
        return points[0][1]
    for (t0, a), (t1, b) in zip(points, points[1:]):
        if t <= t1:
            return a + (b - a) * (t - t0) / (t1 - t0)
    return points[-1][1]


class Miniature:
    def __init__(self, name):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.name = name
        self.materials = {}
        self.root = self.joint(name, None, (0, 0, 0))

    # ------------------------------------------------------------------ materials

    def material(self, color, glow=0.0):
        key = (color, glow)
        if key in self.materials:
            return self.materials[key]
        mat = bpy.data.materials.new(f'{color:06x}{"-glow" if glow else ""}')
        if mat.node_tree is None:
            mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            nodes.clear()
            bsdf = nodes.new('ShaderNodeBsdfPrincipled')
            out = nodes.new('ShaderNodeOutputMaterial')
            mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        bsdf.inputs['Base Color'].default_value = linear(color)
        bsdf.inputs['Roughness'].default_value = 0.8
        bsdf.inputs['Metallic'].default_value = 0.0
        if glow:
            bsdf.inputs['Emission Color'].default_value = linear(color)
            bsdf.inputs['Emission Strength'].default_value = glow
        # Closed shells only: single-sided keeps glTF materials shareable after optimizing
        mat.use_backface_culling = True
        self.materials[key] = mat
        return mat

    # ------------------------------------------------------------------ hierarchy

    def joint(self, name, parent, at, rot=(0, 0, 0)):
        """An animation pivot; the game looks joints up by name (arm-right, leg-left, ...)."""
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_size = 0.04
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = parent
        empty.location = TO_BLENDER @ Vector(at)
        empty.rotation_mode = 'QUATERNION'
        empty.rotation_quaternion = rotation(*rot)
        return empty

    def _place(self, bm, color, parent, at, rot, scale, smooth, sharp, glow, deform, keep, ink=None):
        if deform:
            for vert in bm.verts:
                vert.co = Vector(deform(vert.co.copy()))
        if keep:
            doomed = [f for f in bm.faces if not keep(f.calc_center_median())]
            bmesh.ops.delete(bm, geom=doomed, context='FACES')
        extent = max((v.co.length for v in bm.verts), default=0.0) * max(scale or (1, 1, 1))
        bmesh.ops.transform(bm, matrix=TO_BLENDER.to_4x4(), verts=bm.verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new('part')
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new('part', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        obj.location = TO_BLENDER @ Vector(at)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = rotation(*rot) if rot else Quaternion()
        if scale:
            sx, sy, sz = scale
            obj.scale = (sx, sz, sy)
        mesh.materials.append(self.material(color, glow))
        if smooth:
            mesh.shade_smooth()
            if sharp is not None:
                mesh.set_sharp_from_angle(angle=math.radians(sharp))
        else:
            mesh.shade_flat()
        obj['ink'] = extent >= MIN_INKED if ink is None else ink
        return obj

    # ------------------------------------------------------------------ shapes (game space)

    def lathe(
        self,
        profile,
        color,
        parent,
        at=(0, 0, 0),
        rot=None,
        scale=None,
        segments=20,
        closed=False,
        caps=True,
        smooth=True,
        sharp=None,
        glow=0.0,
        deform=None,
        keep=None,
        ink=None,
    ):
        """Surface of revolution around +Y from [(radius, y), ...]; radius 0 makes a pole."""
        bm = bmesh.new()
        rings = []
        for r, y in profile:
            if r <= 1e-6:
                rings.append([bm.verts.new((0, y, 0))])
            else:
                rings.append(
                    [
                        bm.verts.new(
                            (
                                r * math.sin(2 * math.pi * i / segments),
                                y,
                                r * math.cos(2 * math.pi * i / segments),
                            )
                        )
                        for i in range(segments)
                    ]
                )
        pairs = list(zip(rings, rings[1:]))
        if closed:
            pairs.append((rings[-1], rings[0]))
        for a, b in pairs:
            for i in range(segments):
                j = (i + 1) % segments
                if len(a) == 1 and len(b) > 1:
                    bm.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1 and len(a) > 1:
                    bm.faces.new((a[i], a[j], b[0]))
                elif len(a) > 1:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        if caps and not closed:
            for ring in (rings[0], rings[-1]):
                if len(ring) > 2:
                    bm.faces.new(ring)
        return self._place(
            bm, color, parent, at, rot, scale, smooth, sharp, glow, deform, keep, ink
        )

    def sphere(self, r, color, parent, at=(0, 0, 0), scale=None, rot=None, segments=None, **kw):
        n = segments or segments_for(r)
        rows = max(4, n // 2 + 1)
        profile = [
            (r * math.sin(math.pi * i / rows), r * math.cos(math.pi * i / rows))
            for i in range(rows + 1)
        ]
        return self.lathe(profile, color, parent, at, rot, scale, segments=n, caps=False, **kw)

    def capsule(self, r, length, color, parent, at=(0, 0, 0), rot=None, scale=None, **kw):
        n = segments_for(r)
        cap = [
            (r * math.sin(math.pi / 2 * i / 3), r * math.cos(math.pi / 2 * i / 3)) for i in range(4)
        ]
        top = [(x, y + length / 2) for x, y in cap]
        bottom = [(x, -y - length / 2) for x, y in reversed(cap)]
        return self.lathe(top + bottom, color, parent, at, rot, scale, segments=n, caps=False, **kw)

    def tube(self, r_top, r_bottom, h, color, parent, at=(0, 0, 0), rot=None, scale=None, **kw):
        n = kw.pop('segments', segments_for(max(r_top, r_bottom)))
        profile = [(r_bottom, -h / 2), (r_top, h / 2)]
        return self.lathe(profile, color, parent, at, rot, scale, segments=n, **kw)

    def torus(self, radius, thickness, color, parent, at=(0, 0, 0), rot=None, scale=None, **kw):
        n = kw.pop('segments', segments_for(radius))
        sides = kw.pop('sides', 4)
        profile = [
            (
                radius + thickness * math.cos(2 * math.pi * i / sides),
                thickness * math.sin(2 * math.pi * i / sides),
            )
            for i in range(sides)
        ]
        return self.lathe(profile, color, parent, at, rot, scale, segments=n, closed=True, **kw)

    def box(self, w, h, d, color, parent, at=(0, 0, 0), rot=None, bevel=0.0, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for vert in bm.verts:
            vert.co = Vector((vert.co.x * w, vert.co.y * h, vert.co.z * d))
        obj = self._place(
            bm,
            color,
            parent,
            at,
            rot,
            None,
            kw.pop('smooth', True),
            kw.pop('sharp', 35),
            kw.pop('glow', 0.0),
            None,
            None,
            kw.pop('ink', None),
        )
        if bevel:
            self.bevel(obj, bevel, kw.pop('bevel_segments', 1))
        return obj

    def polyhedron(self, verts, faces, color, parent, at=(0, 0, 0), rot=None, smooth=False, **kw):
        bm = bmesh.new()
        made = [bm.verts.new(v) for v in verts]
        for face in faces:
            bm.faces.new([made[i] for i in face])
        return self._place(
            bm,
            color,
            parent,
            at,
            rot,
            None,
            smooth,
            kw.get('sharp'),
            kw.get('glow', 0.0),
            None,
            None,
            kw.get('ink'),
        )

    def surface(self, point, nu, nv, color, parent, thickness=0.0, **kw):
        """Grid patch from point(u, v) with u, v in [0, 1]; thickness solidifies it."""
        bm = bmesh.new()
        grid = [
            [bm.verts.new(point(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)
        ]
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        obj = self._place(
            bm, color, parent, (0, 0, 0), None, None, True, kw.get('sharp'), 0.0, None, None
        )
        if thickness:
            self.solidify(obj, thickness)
        return obj

    def slab(self, outline, depth, color, parent, at=(0, 0, 0), rot=None, bend=0.0, **kw):
        """Flat outline [(x, y), ...] facing +Z, extruded to `depth`; bend curves it back."""
        bm = bmesh.new()
        front = [bm.verts.new((x, y, depth / 2)) for x, y in outline]
        face = bm.faces.new(front)
        extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
        for vert in [g for g in extruded['geom'] if isinstance(g, bmesh.types.BMVert)]:
            vert.co.z -= depth
        # Triangulate the outline faces first so bending can't leave them non-planar
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        if bend:
            for vert in bm.verts:
                vert.co.z -= bend * vert.co.x**2
        obj = self._place(
            bm,
            color,
            parent,
            at,
            rot,
            None,
            kw.get('smooth', True),
            kw.get('sharp', 40),
            kw.get('glow', 0.0),
            None,
            None,
            kw.get('ink'),
        )
        if kw.get('bevel'):
            self.bevel(obj, kw['bevel'], kw.get('bevel_segments', 1))
        return obj

    def strand(
        self,
        points,
        radius,
        color,
        parent,
        taper=(1.0, 0.0),
        sides=1,
        resolution=3,
        cyclic=False,
        ink=True,
    ):
        """Tapered tube along a smooth curve through game-space points (hair, trims, quillons)."""
        curve = bpy.data.curves.new('strand', 'CURVE')
        curve.dimensions = '3D'
        curve.resolution_u = resolution
        curve.bevel_mode = 'ROUND'
        curve.bevel_depth = radius
        curve.bevel_resolution = sides
        curve.use_fill_caps = True
        spline = curve.splines.new('BEZIER')
        spline.use_cyclic_u = cyclic
        spline.bezier_points.add(len(points) - 1)
        for i, (p, bp) in enumerate(zip(points, spline.bezier_points)):
            bp.co = TO_BLENDER @ Vector(p)
            bp.handle_left_type = 'AUTO'
            bp.handle_right_type = 'AUTO'
            bp.radius = taper[0] + (taper[1] - taper[0]) * i / (len(points) - 1)
        holder = bpy.data.objects.new('strand', curve)
        bpy.context.scene.collection.objects.link(holder)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
        bpy.data.objects.remove(holder)
        bpy.data.curves.remove(curve)
        obj = bpy.data.objects.new('strand', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        mesh.materials.clear()
        mesh.materials.append(self.material(color))
        mesh.shade_smooth()
        obj['ink'] = ink
        return obj

    def lock(self, points, width, color, parent, center=(0, 0, 0), flat=0.35, sections=7):
        """
        Hair clump along a quadratic curve (root, control, tip): a flattened diamond lying on
        the surface around `center`, wide across it and thin away from it, tapering to a point.
        """
        p0, p1, p2 = (Vector(p) for p in points)
        origin = Vector(center)
        bm = bmesh.new()
        rings = []
        for i in range(sections + 1):
            t = i / sections
            p = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
            if i == sections:
                rings.append([bm.verts.new(p)])
                break
            along = (2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)).normalized()
            across = along.cross((p - origin).normalized())
            if across.length < 1e-6:
                across = Vector((1, 0, 0))
            across.normalize()
            out = across.cross(along).normalized()
            half = width * (1 - t) ** 0.9
            rings.append(
                [
                    bm.verts.new(p + across * half),
                    bm.verts.new(p + out * half * flat),
                    bm.verts.new(p - across * half),
                    bm.verts.new(p - out * half * flat),
                ]
            )
        for a, b in zip(rings, rings[1:]):
            for k in range(4):
                if len(b) == 1:
                    bm.faces.new((a[k], a[(k + 1) % 4], b[0]))
                else:
                    bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
        bm.faces.new(rings[0])
        return self._place(
            bm, color, parent, (0, 0, 0), None, None, True, 30, 0.0, None, None, True
        )

    # ------------------------------------------------------------------ modifiers

    def bevel(self, obj, width, segments=2):
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = width
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        return mod

    def solidify(self, obj, thickness):
        mod = obj.modifiers.new('Solidify', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = 1.0
        return mod

    # ------------------------------------------------------------------ output

    def bake(self):
        """
        Applies modifiers and merges each joint's parts into one mesh, materials kept. Parts too
        small for an ink line go into a second '-detail' mesh flagged `ink: false` (glTF extras),
        which the game leaves unoutlined.
        """
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for joint in [o for o in bpy.data.objects if o.type == 'EMPTY']:
            parts = [c for c in joint.children if c.type == 'MESH']
            groups = [
                (inked, suffix, [p for p in parts if bool(p.get('ink', True)) == inked])
                for inked, suffix in ((True, 'skin'), (False, 'detail'))
            ]
            for inked, suffix, group in groups:
                if group:
                    self._merge(joint, group, f'{joint.name}-{suffix}', inked, depsgraph)

    def _merge(self, joint, parts, name, inked, depsgraph):
        bm = bmesh.new()
        materials = []
        for part in parts:
            mesh = bpy.data.meshes.new_from_object(
                part.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph
            )
            mesh.transform(part.matrix_basis)
            for mat in mesh.materials:
                if mat not in materials:
                    materials.append(mat)
            for poly in mesh.polygons:
                poly.material_index = materials.index(mesh.materials[poly.material_index])
            bm.from_mesh(mesh)
            bpy.data.meshes.remove(mesh)
        for part in parts:
            bpy.data.objects.remove(part)
        merged = bpy.data.meshes.new(name)
        bm.to_mesh(merged)
        bm.free()
        for mat in materials:
            merged.materials.append(mat)
        obj = bpy.data.objects.new(name, merged)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = joint
        if not inked:
            obj['ink'] = False

    def triangles(self):
        """Triangle count per merged mesh, largest first, plus the total."""
        counts = {}
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                obj.data.calc_loop_triangles()
                counts[obj.name] = len(obj.data.loop_triangles)
        return sum(counts.values()), sorted(counts.items(), key=lambda item: -item[1])

    def export(self, path=None):
        path = path or output_path()
        self.bake()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            export_yup=True,
            export_apply=True,
            export_texcoords=False,
            export_normals=True,
            export_materials='EXPORT',
            export_extras=True,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            use_selection=False,
        )
        total, parts = self.triangles()
        print('  '.join(f'{name} {count}' for name, count in parts))
        print(f'MINIATURE {self.name}: {total} triangles -> {path}')


def output_path():
    """The .glb path passed after `--` on the Blender command line."""
    args = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if not args:
        raise SystemExit('Pass the output path after --')
    return args[0]
