"""Blade Warden: chibi knight in polished plate over mail, blue tabard with a gold fleur,
longsword and kite shield. Refined from the sculpted miniature, on the same rig.

Run with `npm run models:blender -- blade-warden`, then `npm run models:optimize`.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kit import Miniature, table  # noqa: E402

SKIN = 0xF4C9A4
STEEL = 0xA9B8C8
STEEL_DARK = 0x6F7F94
MAIL = 0x5F6B7D
BLADE = 0xE4EBF2
GOLD = 0xE3B54F
BLUE = 0x2F5FAE
BLUE_DARK = 0x1F3F7A
LEATHER = 0x6B4329
GLOVE = 0x7A4A2C
SOLE = 0x3A2A20
HAIR = 0x6E4227
BROW = 0x4A2A17
IRIS = 0x3B5D7A
PUPIL = 0x1C1A28
WHITE = 0xF8F4EE
LID = 0x2B1D18
LIP = 0x9A5A48

HIP = 0.3
HEAD_R = 0.185

m = Miniature('blade-warden')
root = m.root

# ---------------------------------------------------------------- rig (matches humanoid())
legs = {side: m.joint('leg-left' if side < 0 else 'leg-right', root, (side * 0.068, HIP, 0))
        for side in (-1, 1)}
torso = m.joint('torso', root, (0, HIP, 0))
# Sword in the right hand like the art: the right arm sits on the character's right (-x)
arms = {side: m.joint('arm-right' if side < 0 else 'arm-left', torso, (side * 0.152, 0.235, 0),
                      rot=(0, 0, side * 0.14))
        for side in (-1, 1)}
head = m.joint('head', torso, (0, 0.44, 0))
weapon = m.joint('weapon', arms[-1], (0, -0.18, 0.02), rot=(0.55, 0, 0))
offhand = m.joint('offhand', arms[1], (0, -0.18, 0.02))
shield = m.joint('shield', offhand, (0.03, 0.02, 0.06), rot=(0, 0.55, 0))


def fleur(parent, at, size, color=GOLD):
    """Stylised fleur emblem facing +z: a tall centre petal, two curled side petals, a band."""
    x, y, z = at
    s = size
    m.sphere(0.02 * s, color, parent, at=(x, y + 0.012 * s, z), scale=(0.7, 1.6, 0.35), ink=False)
    for side in (-1, 1):
        m.sphere(0.016 * s, color, parent, at=(x + side * 0.017 * s, y + 0.003 * s, z),
                 scale=(0.6, 1.3, 0.35), rot=(0, 0, -side * 0.65), ink=False)
    m.box(0.038 * s, 0.008 * s, 0.009 * s, color, parent, at=(x, y - 0.011 * s, z + 0.001),
          ink=False)
    m.sphere(0.011 * s, color, parent, at=(x, y - 0.023 * s, z), scale=(0.6, 1.2, 0.35),
             ink=False)


# ---------------------------------------------------------------- legs: cuisse, knee, greave, sabaton
for side, leg in legs.items():
    m.capsule(0.043, 0.15, MAIL, leg, at=(0, -0.11, 0))
    m.lathe([(0.05, -0.095), (0.056, -0.04), (0.057, 0.005)], STEEL, leg)
    m.sphere(0.033, STEEL, leg, at=(0, -0.108, 0.034), scale=(1.05, 0.8, 0.75))
    m.sphere(0.008, GOLD, leg, at=(0, -0.108, 0.058))
    m.lathe([(0.043, -0.225), (0.047, -0.17), (0.049, -0.125)], STEEL, leg)
    m.torus(0.047, 0.006, STEEL_DARK, leg, at=(0, -0.226, 0))
    # Sabaton: a plated foot, overlapping toe lames and a leather sole
    m.box(0.09, 0.055, 0.13, STEEL, leg, at=(0, -0.268, 0.012), bevel=0.018, bevel_segments=2)
    for i, (y, z) in enumerate([(-0.262, 0.07), (-0.27, 0.098)]):
        m.sphere(0.045 - i * 0.004, STEEL, leg, at=(0, y, z), scale=(1.0, 0.62, 0.8))
    m.box(0.094, 0.014, 0.17, SOLE, leg, at=(0, -0.293, 0.03), bevel=0.006)

# ---------------------------------------------------------------- torso: mail skirt, plate, tabard
# Mail skirt flaring over the hips, under two plate tassets
m.lathe([(0.152, -0.085), (0.145, -0.03), (0.13, 0.05)], MAIL, torso)
m.lathe([(0.152, -0.005), (0.143, 0.035)], STEEL, torso, caps=False)
m.lathe([(0.16, -0.045), (0.151, -0.005)], STEEL, torso, caps=False)
for y in (-0.005, -0.045):
    m.torus(0.155 if y < -0.02 else 0.148, 0.006, STEEL_DARK, torso, at=(0, y, 0))

# Breastplate: a barrel chest pushed forward, with a gorget and mail at the neck
CHEST = [(0.128, 0.04), (0.134, 0.08), (0.138, 0.14), (0.133, 0.2), (0.117, 0.245), (0.088, 0.272)]
m.lathe(CHEST, STEEL, torso, scale=(1, 1, 1.07))
m.torus(0.134, 0.005, STEEL_DARK, torso, at=(0, 0.09, 0), scale=(1, 1, 1.07))
m.lathe([(0.108, 0.255), (0.1, 0.28), (0.078, 0.298)], STEEL, torso, caps=False, scale=(1, 1, 1.05))
m.torus(0.106, 0.007, GOLD, torso, at=(0, 0.257, 0), scale=(1, 1, 1.05))
m.tube(0.058, 0.064, 0.05, MAIL, torso, at=(0, 0.31, 0))


def body_front(y):
    """How far the plate stands forward at height y (tabard rides just over it)."""
    return table([(0.235, 0.128), (0.2, 0.142), (0.14, 0.153), (0.08, 0.148), (0.04, 0.149),
                  (-0.17, 0.158)], y)


def tabard(sign, bottom, half_top, half_bottom):
    def point(u, v):
        y = 0.235 + (bottom - 0.235) * v
        half = table([(0.235, half_top), (0.04, half_top + 0.004), (bottom, half_bottom)], y)
        x = (u * 2 - 1) * half
        wrap = 2.4 if y > 0.04 else 0.9
        return (x, y, sign * (body_front(y) + 0.004 - wrap * x * x))

    return point


front = tabard(1, -0.17, 0.07, 0.086)
m.surface(front, 4, 10, BLUE, torso, thickness=0.01)
m.surface(tabard(-1, -0.13, 0.066, 0.078), 4, 8, BLUE, torso, thickness=0.01)

# Gold border down both edges and along the hem, then the fleur on the chest
for u in (0.0, 1.0):
    edge = [front(u, v / 6) for v in range(7)]
    m.strand([(x, y, z + 0.004) for x, y, z in edge], 0.0065, GOLD, torso, taper=(1, 1))
hem = [front(u / 4, 1.0) for u in range(5)]
m.strand([(x, y + 0.004, z + 0.004) for x, y, z in hem], 0.0065, GOLD, torso, taper=(1, 1))
fleur(torso, (0, 0.158, body_front(0.158) + 0.016), 1.0)

# Belt with a gold buckle, and a pouch on the right hip
m.lathe([(0.149, 0.05), (0.149, 0.082)], LEATHER, torso, caps=False, scale=(1, 1, 1.08))
m.box(0.052, 0.042, 0.014, GOLD, torso, at=(0, 0.066, 0.163), bevel=0.006)
m.box(0.03, 0.022, 0.01, LEATHER, torso, at=(0, 0.066, 0.168))
m.box(0.05, 0.05, 0.034, LEATHER, torso, at=(0.112, 0.03, 0.095), rot=(0, 0.75, 0), bevel=0.01)
m.box(0.054, 0.02, 0.038, 0x5A3A24, torso, at=(0.112, 0.052, 0.096), rot=(0, 0.75, 0),
      bevel=0.006)
m.sphere(0.007, GOLD, torso, at=(0.126, 0.045, 0.118))

# ---------------------------------------------------------------- arms: pauldrons, cops, gauntlets
for side, arm in arms.items():
    out = side * 0.012
    m.sphere(0.05, MAIL, arm)
    # Two-lame pauldron with a gold-trimmed rim, flared away from the body
    tilt = (0, 0, side * 0.18)
    plate = m.lathe([(0.0, 0.09), (0.042, 0.085), (0.072, 0.064), (0.091, 0.03),
                     (0.097, -0.004), (0.093, -0.022)], STEEL, arm, at=(out, 0.012, 0), rot=tilt,
                    caps=False)
    m.solidify(plate, 0.008)
    m.torus(0.094, 0.0065, GOLD, arm, at=(out, -0.01, 0), rot=tilt)
    lame = m.lathe([(0.088, -0.032), (0.084, -0.062)], STEEL, arm, at=(out, 0.012, 0), rot=tilt,
                   caps=False)
    m.solidify(lame, 0.006)
    m.sphere(0.008, GOLD, arm, at=(out + side * 0.03, 0.09, 0.05))
    m.capsule(0.035, 0.05, MAIL, arm, at=(0, -0.075, 0))
    m.sphere(0.035, STEEL, arm, at=(0, -0.112, -0.004), scale=(1.06, 0.8, 1.0))
    m.lathe([(0.035, -0.156), (0.039, -0.125)], STEEL, arm)
    m.lathe([(0.05, -0.172), (0.047, -0.163), (0.037, -0.148)], STEEL, arm, caps=False)
    m.sphere(0.042, GLOVE, arm, at=(0, -0.188, 0.008), scale=(0.95, 1.05, 0.95))

# ---------------------------------------------------------------- longsword
m.tube(0.0155, 0.0155, 0.105, BLUE_DARK, weapon)
for y in (-0.03, 0.0, 0.03):
    m.torus(0.016, 0.0035, GOLD, weapon, at=(0, y, 0))
m.sphere(0.024, GOLD, weapon, at=(0, -0.068, 0), scale=(1, 0.9, 1))
m.sphere(0.01, BLUE, weapon, at=(0, -0.068, 0.021), scale=(1, 1, 0.5))
m.strand([(-0.082, 0.078, 0), (-0.042, 0.066, 0), (0, 0.062, 0), (0.042, 0.066, 0),
          (0.082, 0.078, 0)], 0.011, GOLD, weapon, taper=(0.8, 0.8))
for side in (-1, 1):
    m.sphere(0.013, GOLD, weapon, at=(side * 0.084, 0.08, 0))
m.sphere(0.02, GOLD, weapon, at=(0, 0.074, 0), scale=(1, 1.1, 0.7), segments=4)

# Diamond-section blade: ridged faces, tapering to a point
BASE, LENGTH = 0.082, 0.46
stations = [(0.0, 0.02, 0.006), (0.15, 0.019, 0.006), (0.55, 0.0175, 0.0055),
            (0.85, 0.0155, 0.005), (0.95, 0.009, 0.004)]
verts = []
for t, w, th in stations:
    y = BASE + LENGTH * t
    verts += [(-w, y, 0), (0, y, th), (w, y, 0), (0, y, -th)]
verts.append((0, BASE + LENGTH, 0))
tip = len(verts) - 1
faces = [(3, 2, 1, 0)]
for s in range(len(stations) - 1):
    a, b = s * 4, s * 4 + 4
    for i in range(4):
        j = (i + 1) % 4
        faces.append((a + i, a + j, b + j, b + i))
last = (len(stations) - 1) * 4
faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
m.polyhedron(verts, faces, BLADE, weapon)
for z in (1, -1):
    m.box(0.0055, LENGTH * 0.62, 0.002, STEEL_DARK, weapon,
          at=(0, BASE + LENGTH * 0.38, z * 0.0058), sharp=None)

# ---------------------------------------------------------------- kite shield
def kite(scale):
    """Kite outline: broad rounded top tapering to a point, as a smooth closed loop."""
    pts = []
    for i in range(32):
        a = 2 * math.pi * i / 32
        x = math.sin(a)
        y = math.cos(a)
        # Wide shoulders, pointed foot
        width = 0.112 * (1 - 0.55 * max(0.0, -y) ** 1.6)
        height = 0.15 if y > 0 else 0.178
        pts.append((x * width * scale, (y * height - 0.004) * scale + (0.012 if y > 0 else 0)))
    return pts


m.slab(kite(1.0), 0.024, STEEL, shield, bend=1.5, bevel=0.004)
m.slab(kite(0.86), 0.028, BLUE, shield, at=(0, -0.002, 0.001), bend=1.5)
border = [(x, y, 0.016 - 1.5 * x * x) for x, y in kite(0.76)[::2]]
m.strand(border, 0.0045, GOLD, shield, taper=(1, 1), sides=0, cyclic=True)
fleur(shield, (0, 0.035, 0.017), 1.35)
m.sphere(0.028, STEEL, shield, at=(0, -0.035, 0.014), scale=(1, 1, 0.55))
for x, y in kite(0.93)[::4]:
    m.sphere(0.0065, GOLD, shield, at=(x, y, 0.014 - 1.5 * x * x), segments=6)

# ---------------------------------------------------------------- head: face, eyes, swept hair
def jaw(p):
    """Softens the chibi skull into cheeks and a small chin."""
    if p.y < -0.02:
        t = min(1.0, (-0.02 - p.y) / 0.165)
        p.x *= 1 - 0.2 * t * t
        p.z *= 1 - 0.06 * t * t
    p.x *= 0.98
    return p


m.sphere(HEAD_R, SKIN, head, segments=20, deform=jaw)
for side in (-1, 1):
    m.sphere(0.026, SKIN, head, at=(side * 0.172, -0.03, -0.004), scale=(0.5, 1.0, 0.75))
    x = side * 0.068
    m.sphere(0.03, WHITE, head, at=(x, -0.032, 0.161), scale=(0.85, 1.12, 0.38))
    m.sphere(0.024, IRIS, head, at=(x - side * 0.003, -0.037, 0.168), scale=(0.78, 1.1, 0.36))
    m.sphere(0.012, PUPIL, head, at=(x - side * 0.003, -0.039, 0.173), scale=(0.8, 1.1, 0.4))
    m.sphere(0.0075, WHITE, head, at=(x + side * 0.005, -0.026, 0.178))
    m.box(0.054, 0.009, 0.01, LID, head, at=(x, -0.004, 0.172), rot=(0.2, 0, -side * 0.12))
    m.box(0.052, 0.013, 0.012, BROW, head, at=(side * 0.07, 0.033, 0.17),
          rot=(0.25, 0, side * 0.26))
m.sphere(0.011, SKIN, head, at=(0, -0.07, 0.168), scale=(0.9, 0.8, 0.8))
m.box(0.03, 0.006, 0.006, LIP, head, at=(0, -0.112, 0.147), rot=(0.4, 0, 0))

# Hair: a cap over the crown and back, then tapered locks swept up and back
def cap(c):
    face = c.z > 0.02 and c.y < 0.075
    cheek = c.y < -0.06 and c.z > -0.09
    ear = abs(c.x) > 0.14 and c.y < 0.01 and c.z > -0.07
    return not (face or cheek or ear or c.y < -0.15)


m.solidify(m.sphere(0.197, HAIR, head, segments=20, keep=cap), 0.006)
# Clumps swept up off the hairline and back over the crown, like the art
for i, x in enumerate((-0.11, -0.065, -0.02, 0.025, 0.07, 0.11)):
    # Roots tuck under the cap's edge so their ends don't draw a line across the brow
    root = (x, 0.088, math.sqrt(0.19**2 - x * x - 0.088**2) - 0.01)
    lift = 0.018 * (1 - abs(x) / 0.11)
    m.lock([root, (x * 1.1 + 0.02, 0.2 + lift, 0.13), (x * 1.15 + 0.05, 0.242 + lift, -0.05)],
           0.05, HAIR, head)
# Crown spikes fanning out from the whorl
whorl = (0.02, 0.19, -0.06)
for a in (-2.4, -1.6, -0.8, 0.0, 0.8, 1.6, 2.4):
    dx, dz = math.sin(a), -math.cos(a)
    m.lock([whorl, (whorl[0] + dx * 0.12, whorl[1] + 0.02, whorl[2] + dz * 0.12),
            (whorl[0] + dx * 0.19, whorl[1] - 0.025, whorl[2] + dz * 0.19)], 0.055, HAIR, head)
# Back of the head falls in clumps with spiky ends
for x in (-0.12, -0.04, 0.04, 0.12):
    m.lock([(x, 0.12, -0.15), (x * 1.2, 0.02, -0.22), (x * 1.3, -0.1, -0.2)], 0.055, HAIR, head)
# Sides swept back over the ears, and sideburns
for side in (-1, 1):
    m.lock([(side * 0.16, 0.1, 0.07), (side * 0.215, 0.04, 0.02), (side * 0.2, -0.04, -0.06)],
           0.05, HAIR, head)
    m.lock([(side * 0.17, 0.04, 0.08), (side * 0.19, -0.02, 0.07), (side * 0.175, -0.085, 0.075)],
           0.03, HAIR, head)

m.export()
