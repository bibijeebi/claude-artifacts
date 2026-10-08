import bpy, bmesh, math
from mathutils import Vector

IN = 0.0254

P = dict(
    bowl_d=15.0, bowl_top=16.75, bowl_h=6.0, wall=0.05, fill=2.75,
    rim_z=18.0, hole_d=1.625,
    disc_d=14.75, disc_t=0.375, disc_hole=3.5,
    cage_d=2.5, stand=21.0,
)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metal=0.0, rough=0.5, trans=0.0, ior=1.45, alpha=1.0, emit=None, coat=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Transmission Weight"].default_value = trans
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 3.0
    return m


def M():
    return dict(
        steel=mat("steel", (0.82, 0.82, 0.84), 1.0, 0.22),
        brushed=mat("brushed", (0.7, 0.7, 0.72), 1.0, 0.4),
        water=mat("water", (0.75, 0.9, 1.0), 0, 0.02, 1.0, 1.333),
        hdpe=mat("hdpe", (0.92, 0.92, 0.9), 0, 0.45),
        foam=mat("foam", (0.12, 0.13, 0.14), 0, 0.9),
        wood=mat("wood", (0.33, 0.19, 0.08), 0, 0.6),
        blue=mat("blue", (0.05, 0.25, 0.75), 0, 0.35),
        tube=mat("tube", (0.25, 0.55, 0.95), 0, 0.3),
        black=mat("black", (0.02, 0.02, 0.02), 0, 0.4),
        pp=mat("pp", (0.08, 0.08, 0.08), 0, 0.5),
        abs=mat("abs", (0.55, 0.57, 0.6), 0, 0.5),
        tub=mat("tub", (0.95, 0.95, 0.94), 0, 0.12, coat=0.5),
        tile=mat("tile", (0.42, 0.45, 0.48), 0, 0.6),
        led=mat("led", (0.1, 1, 0.3), 0, 0.3, emit=(0.1, 1, 0.3)),
        brass=mat("brass", (0.85, 0.65, 0.3), 1.0, 0.25),
        red=mat("red", (0.75, 0.08, 0.05), 0, 0.4),
    )


def obj_from_bm(bm, name, material=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if material:
        me.materials.append(material)
    return o


def cyl(name, r, h, z0, x=0, y=0, material=None, segs=64, axis="Z", ring_r=None):
    bm = bmesh.new()
    if ring_r:
        bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r * IN, radius2=r * IN, depth=h * IN)
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r * IN, radius2=r * IN, depth=h * IN)
    o = obj_from_bm(bm, name, material)
    if axis == "X":
        o.rotation_euler = (0, math.pi / 2, 0)
        o.location = ((x + h / 2) * IN, y * IN, z0 * IN)
    elif axis == "Y":
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = (x * IN, (y + h / 2) * IN, z0 * IN)
    else:
        o.location = (x * IN, y * IN, (z0 + h / 2) * IN)
    return o


def box(name, sx, sy, sz, cx, cy, cz, material=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx * IN, sy * IN, sz * IN), verts=bm.verts)
    o = obj_from_bm(bm, name, material, smooth=False)
    o.location = (cx * IN, cy * IN, cz * IN)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel * IN
        b.segments = 3
    return o


def revolve(name, prof, material, thick=None, steps=128):
    bm = bmesh.new()
    closed = prof[0] == prof[-1]
    if closed:
        prof = prof[:-1]
    vs = [bm.verts.new((r * IN, 0, z * IN)) for r, z in prof]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    if closed:
        bm.edges.new((vs[-1], vs[0]))
    o = obj_from_bm(bm, name, material)
    s = o.modifiers.new("screw", "SCREW")
    s.angle = 2 * math.pi
    s.steps = steps
    s.render_steps = steps
    s.use_merge_vertices = True
    s.use_smooth_shade = True
    if thick:
        so = o.modifiers.new("solid", "SOLIDIFY")
        so.thickness = thick * IN
        so.offset = 1
    return o


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def curve(name, pts, r, material, z_in=True):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r * IN
    cu.bevel_resolution = 6
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p) * IN
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    cu.materials.append(material)
    return o


def boolean(o, cutter, op="DIFFERENCE"):
    m = o.modifiers.new("bool", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.solver = "EXACT"
    return m


def build(fill=None, disc_z=None, with_water=True, with_tub=True, fluid_mode=False, ball_open=False):
    p = dict(P)
    if fill is not None:
        p["fill"] = fill
    m = M()
    R = p["bowl_d"] / 2
    RT = p["bowl_top"] / 2
    H = p["bowl_h"]
    rz = lambda z: R + (RT - R) * z / H
    z0 = p["rim_z"] - H
    hr = p["hole_d"] / 2
    objs = {}

    prof = [(hr, 0), (R - 0.5, 0), (R - 0.15, 0.05), (R - 0.02, 0.25), (rz(0.5), 0.5), (rz(H - 0.1), H - 0.1), (RT + 0.05, H), (RT + 0.2, H + 0.02)]
    bowl = revolve("Bowl", prof, m["steel"], thick=-p["wall"])
    bowl.location.z = z0 * IN
    objs["bowl"] = bowl
    for s in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.3 * IN, minor_radius=0.18 * IN, location=(s * (RT + 0.9) * IN, 0, (z0 + H - 0.9) * IN), rotation=(0, 0, 0))
        h = bpy.context.active_object
        h.name = f"Handle{s}"
        h.scale = (1, 1.6, 0.35)
        h.data.materials.append(m["steel"])
        bpy.ops.object.shade_smooth()

    bo = 0.41
    def ann(name, ri, ro, za, zb, mm):
        o = revolve(name, [(ri, za), (ro, za), (ro, zb), (ri, zb), (ri, za)], mm, steps=64)
        o.location.z = 0
        return o
    bk_top = ann("BulkheadFlange", bo, 1.2, z0, z0 + 0.2, m["pp"])
    bk_body = ann("BulkheadBody", bo, 0.68, z0 - 1.2, z0, m["pp"])
    bk_nut = ann("BulkheadNut", 0.68, 1.05, z0 - 0.55, z0 - 0.08, m["pp"])
    nip = ann("Nipple", bo, 0.52, z0 - 2.3, z0 - 1.1, m["brushed"])
    vz = z0 - 3.5
    vb = revolve("ValveBody", [(bo, vz - 1.3), (0.85, vz - 1.3), (0.85, vz + 1.3), (bo, vz + 1.3), (bo, vz + 0.62), (0.62, vz + 0.45), (0.62, vz - 0.45), (bo, vz - 0.62), (bo, vz - 1.3)], m["steel"], steps=64)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.585 * IN, segments=48, ring_count=24, location=(0, 0, vz * IN))
    ball = bpy.context.active_object
    ball.name = "ValveBall"
    ball.data.materials.append(m["brass"])
    bore = cyl("BallBore", bo, 2, vz - 1, segs=32)
    boolean(ball, bore)
    apply_all(ball)
    bpy.data.objects.remove(bore)
    act = box("Actuator", 3.2, 2.6, 2.6, 2.4, 0, vz, m["blue"], bevel=0.25)
    act_stem = cyl("ActuatorStem", 0.2, 1.0, vz, x=0.55, material=m["brushed"], axis="X")
    led = cyl("ValveLED", 0.12, 0.05, vz + 1.3, x=2.4, y=-0.6, material=m["led"])
    tail = ann("TailPipe", bo, 0.52, z0 - 8.8, z0 - 4.75, m["brushed"])
    objs["ball"] = ball
    ball.rotation_euler.x = 0 if ball_open else math.pi / 2
    objs["drain"] = [bk_top, bk_body, bk_nut, nip, vb, tail]
    objs["valve_act"] = act

    cx = R - 1.55
    cage = cyl("FloatCage", p["cage_d"] / 2, H - 0.3, z0 + 0.1, x=cx, material=m["steel"], segs=24, ring_r=True)
    bm = bmesh.new()
    bm.from_mesh(cage.data)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6], cuts=10, use_grid_fill=False)
    bm.to_mesh(cage.data)
    bm.free()
    w = cage.modifiers.new("wire", "WIREFRAME")
    w.thickness = 0.06 * IN
    fz = z0 + p["fill"] + 0.6
    rw = rz(p["fill"] + 0.6)
    fstem = cyl("FloatStem", 0.25, 2.2, fz, x=rw - 1.0, material=m["pp"], axis="X")
    fnut = cyl("FloatNut", 0.42, 0.25, fz, x=rw + 0.05, material=m["pp"], axis="X")
    farm = cyl("FloatArm", 0.07, 2.2, fz - 0.2, x=cx - 1.0, material=m["pp"], axis="X")
    farm.rotation_euler = (0, math.pi / 2 + 0.25, 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55 * IN, location=(cx * IN, 0, (z0 + p["fill"] - 0.1) * IN))
    fball = bpy.context.active_object
    fball.name = "FloatBall"
    fball.data.materials.append(m["hdpe"])
    bpy.ops.object.shade_smooth()

    dz = disc_z if disc_z is not None else z0 + p["fill"] - 0.32
    disc = revolve("Disc", [(p["disc_hole"] / 2 + 0.2, 0), (p["disc_hole"] / 2, 0.19), (p["disc_hole"] / 2 + 0.2, p["disc_t"]), (p["disc_d"] / 2 - 0.15, p["disc_t"] + 0.12), (p["disc_d"] / 2, p["disc_t"] - 0.05), (p["disc_d"] / 2, 0), (p["disc_hole"] / 2 + 0.2, 0)], m["hdpe"])
    notch = cyl("NotchCutter", p["cage_d"] / 2 + 0.2, 4, -1, x=cx, segs=32)
    apply_all(disc)
    notch.location.z = 0
    boolean(disc, notch)
    apply_all(disc)
    bpy.data.objects.remove(notch)
    foam = revolve("Pontoon", [(3.0, 0), (5.2, 0), (5.2, 0.5), (3.0, 0.5), (3.0, 0)], m["foam"])
    apply_all(foam)
    notch2 = cyl("NotchCutter2", p["cage_d"] / 2 + 0.3, 4, -1, x=cx, segs=32)
    boolean(foam, notch2)
    apply_all(foam)
    bpy.data.objects.remove(notch2)
    foam.location.z = -0.5 * IN
    foam.parent = disc
    for i in range(3):
        a = math.pi / 2 + i * 2 * math.pi / 3
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25 * IN, location=(math.cos(a) * 4.1 * IN, math.sin(a) * 4.1 * IN, -0.5 * IN))
        n = bpy.context.active_object
        n.name = f"Nub{i}"
        n.data.materials.append(m["hdpe"])
        n.parent = disc
    disc.location.z = (dz + 0.5) * IN
    objs["disc"] = disc

    if with_water:
        water = revolve("Water", [(0, 0.03), (R - p["wall"] - 0.01, 0.03), (rz(p["fill"]) - p["wall"] - 0.01, p["fill"]), (0, p["fill"])], m["water"])
        water.location.z = z0 * IN
        objs["water"] = water

    S = p["stand"]
    ring_z = p["rim_z"] - 0.95
    top = box("StandTop", S, S, 0.75, 0, 0, ring_z - 0.375, m["wood"])
    hole = cyl("StandHole", RT + 0.1, 3, ring_z - 2, segs=96)
    boolean(top, hole)
    apply_all(top)
    bpy.data.objects.remove(hole)
    legs = []
    for sx in (1, -1):
        for sy in (1, -1):
            legs.append(box("Leg", 3.5, 1.5, ring_z - 0.75, sx * (S / 2 - 1.75), sy * (S / 2 - 0.75), (ring_z - 0.75) / 2, m["wood"]))
    for sy in (1, -1):
        legs.append(box("Apron", S - 7, 1.5, 3.5, 0, sy * (S / 2 - 0.75), ring_z - 0.75 - 1.75, m["wood"]))
        legs.append(box("Stretcher", S - 7, 1.5, 3.5, 0, sy * (S / 2 - 0.75), 3.0, m["wood"]))
    objs["stand"] = [top] + legs

    lx = S / 2 - 1.75
    ly = -(S / 2 - 0.75)
    sol_z = 12.0
    sol = cyl("InletValveBody", 0.45, 1.6, sol_z - 0.8, x=lx + 0.6, y=ly - 1.4, material=m["steel"], segs=6)
    coil = box("InletValveActuator", 2.2, 1.9, 1.9, lx + 0.6, ly - 1.4 - 1.6, sol_z, m["blue"], bevel=0.18)
    chk = cyl("CheckValve", 0.28, 1.2, fz, x=rw + 1.0, material=m["red"], axis="X")
    tube1 = curve("InletTubeA", [(lx + 6, ly - 8, 1.0), (lx + 3, ly - 3, 2.0), (lx + 0.6, ly - 1.4, sol_z - 2.5), (lx + 0.6, ly - 1.4, sol_z - 0.85)], 0.125, m["tube"])
    tube2 = curve("InletTubeB", [(lx + 0.6, ly - 1.4, sol_z + 0.85), (lx + 0.4, ly - 0.2, ring_z + 1.5), (rw + 4.0, -2.0, fz + 1.5), (rw + 2.2, 0, fz)], 0.125, m["tube"])
    objs["inlet"] = [sol, coil, chk, tube1, tube2]

    ex, ey = -(S / 2 - 1.75), S / 2 + 0.9
    esp = box("ESP32Box", 4.2, 1.6, 3.2, ex, ey, 14.5, m["abs"], bevel=0.2)
    eled = box("ESPLed", 0.25, 0.1, 0.25, ex + 1.4, ey - 0.85, 15.6, m["led"])
    c1 = curve("CableValve", [(ex + 1.5, ey - 0.5, 12.9), (ex + 4, ey - 3, 9), (2.4, 2, z0 - 3.5), (2.4, 1.3, z0 - 3.5)], 0.09, m["black"])
    c2 = curve("CableSolenoid", [(ex - 1.5, ey - 0.5, 12.9), (-2, ey - 4, 6), (lx, ly - 5, 10), (lx + 0.6, ly - 3.4, sol_z + 0.6)], 0.09, m["black"])
    objs["ctrl"] = [esp, c1, c2]

    if with_tub:
        floor = box("TubBasin", 28, 54, 0.5, 0, 0, -0.25, m["tub"])
        wl = box("TubWallBack", 28, 2.5, 16, 0, 28.25, 8, m["tub"], bevel=0.8)
        wr = box("TubWallSide", 2.5, 54, 16, -15.25, 0, 8, m["tub"], bevel=0.8)
        tile = box("Tile", 80, 0.5, 60, 0, 30, 30, m["tile"])
        tile2 = box("Tile2", 0.5, 80, 60, -17, 0, 30, m["tile"])
        objs["tub"] = [floor, wl, wr, tile, tile2]
    return objs, p


def studio(engine="CYCLES", samples=48, res=(1920, 1080)):
    s = bpy.context.scene
    s.render.engine = engine
    s.render.resolution_x, s.render.resolution_y = res
    s.render.film_transparent = False
    if engine == "CYCLES":
        s.cycles.samples = samples
        s.cycles.use_denoising = True
        s.cycles.device = "CPU"
        s.cycles.max_bounces = 10
        s.cycles.transmission_bounces = 10
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    s.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    bg.inputs[1].default_value = 0.25
    for name, loc, energy, size, rot in [
        ("Key", (0.9, -0.9, 1.4), 120, 0.8, (0.9, 0, 0.75)),
        ("Fill", (-1.0, -0.6, 0.9), 35, 1.2, (1.1, 0, -1.0)),
        ("Rim", (-0.3, 1.0, 1.3), 60, 0.6, (-0.8, 0, 3.0)),
    ]:
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energy
        l.size = size
        o = bpy.data.objects.new(name, l)
        o.location = loc
        o.rotation_euler = rot
        s.collection.objects.link(o)


def camera(loc, target, lens=40, name="Cam"):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    o = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(o)
    o.location = Vector(loc)
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = o
    return o


def cutaway(objs, y0=0.0):
    cut = box("Cutter", 60, 60, 80, 0, -30 + y0, 20)
    cut.hide_render = True
    cut.hide_viewport = True
    targets = [objs["bowl"], objs.get("water"), objs["disc"], objs["ball"], objs["valve_act"]] + objs["drain"] + [objs["stand"][0]] + objs["stand"][1:]
    for o in bpy.data.objects:
        if o.name.startswith(("FloatCage", "Pontoon", "Handle")):
            targets.append(o)
    for t in targets:
        if t and t.type == "MESH":
            boolean(t, cut)
    return cut
