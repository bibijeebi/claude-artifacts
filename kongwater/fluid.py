import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
from model import *

A = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
RES = int(A[0])
END = int(A[1])
CACHE = A[2]
TS = float(A[3])
WF_H = float(A[4]) if len(A) > 4 else 3.2
OPEN_A, OPEN_B = 8, 8 + int(round(7 * 24 / TS))


def setup(bake=True):
    clear()
    objs, p = build(with_tub=True)
    s = bpy.context.scene
    s.frame_start, s.frame_end = 1, END
    z0 = p["rim_z"] - p["bowl_h"]
    ball = objs["ball"]
    ball.rotation_euler.x = math.pi / 2
    ball.keyframe_insert("rotation_euler", index=0, frame=OPEN_A)
    ball.rotation_euler.x = 0
    ball.keyframe_insert("rotation_euler", index=0, frame=OPEN_B)

    for o in [objs["bowl"], ball] + objs["drain"] + [objs["water"]]:
        apply_all(o) if o is not ball else None

    import bmesh as _bm
    for o in [objs["bowl"], ball, objs["water"]] + objs["drain"]:
        b = _bm.new(); b.from_mesh(o.data)
        _bm.ops.remove_doubles(b, verts=b.verts, dist=1e-6)
        _bm.ops.recalc_face_normals(b, faces=b.faces)
        b.to_mesh(o.data); b.free()
    R, RT, H = p["bowl_d"] / 2, p["bowl_top"] / 2, p["bowl_h"]
    dom = box("Domain", 20.4, 20.4, 12.8, 0, 0, z0 - 6 + 6.4)
    dm = dom.modifiers.new("Fluid", "FLUID")
    dm.fluid_type = "DOMAIN"
    d = dm.domain_settings
    d.domain_type = "LIQUID"
    d.resolution_max = RES
    d.time_scale = TS
    d.cfl_condition = 2.0
    d.use_mesh = True
    d.mesh_scale = 2
    d.particle_radius = 1.2
    d.use_collision_border_bottom = False
    d.cache_directory = CACHE
    d.cache_type = "ALL"
    d.cache_frame_start = 1
    d.cache_frame_end = END
    d.use_adaptive_timesteps = True
    dom.data.materials.clear()
    dom.data.materials.append(bpy.data.materials["water"])

    w = objs["water"]
    bpy.data.objects.remove(w)
    w = cyl("WaterFlow", R - 0.45, WF_H, z0 + 0.35, segs=48)
    objs["water"] = w
    fm = w.modifiers.new("Fluid", "FLUID")
    fm.fluid_type = "FLOW"
    f = fm.flow_settings
    f.flow_type = "LIQUID"
    f.flow_behavior = "GEOMETRY"
    f.flow_source = "MESH"
    w.hide_render = True

    R, RT, H = p["bowl_d"] / 2, p["bowl_top"] / 2, p["bowl_h"]
    rz = lambda z: R + (RT - R) * z / H
    vz = -3.5
    prof = [(0.41, -5.4), (0.41, 0.0),
            (R - 0.5, 0.0), (R - 0.15, 0.05), (R - 0.02, 0.25), (rz(0.5), 0.5), (rz(H), H),
            (9.9, H), (9.9, -5.4), (0.41, -5.4)]
    proxy = revolve("EffectorProxy", prof, None, steps=96)
    apply_all(proxy)
    proxy.location.z = z0 * IN
    b = _bm.new(); b.from_mesh(proxy.data)
    _bm.ops.remove_doubles(b, verts=b.verts, dist=1e-6)
    _bm.ops.recalc_face_normals(b, faces=b.faces)
    b.to_mesh(proxy.data); b.free()
    proxy.hide_render = True
    proxy.display_type = "WIRE"
    plug = cyl("Plug", 0.5, 1.4, z0 + vz - 0.7, segs=32)
    plug.hide_render = True
    plug.scale = (1, 1, 1)
    plug.keyframe_insert("scale", frame=OPEN_A)
    plug.scale = (0.02, 0.02, 1)
    plug.keyframe_insert("scale", frame=OPEN_B)
    outf = box("Outflow", 30, 30, 0.6, 0, 0, z0 - 6 + 0.3)
    outf.hide_render = True
    om = outf.modifiers.new("Fluid", "FLUID")
    om.fluid_type = "FLOW"
    om.flow_settings.flow_type = "LIQUID"
    om.flow_settings.flow_behavior = "OUTFLOW"
    for o in [proxy, plug]:
        em = o.modifiers.new("Fluid", "FLUID")
        em.fluid_type = "EFFECTOR"
        em.effector_settings.effector_type = "COLLISION"
        em.effector_settings.surface_distance = 0.0
        em.effector_settings.use_effector = True
    return objs, p, dom


if __name__ == "__main__":
    objs, p, dom = setup()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, "fluid.blend"))
    bpy.context.view_layer.objects.active = dom
    t = time.time()
    with bpy.context.temp_override(active_object=dom, object=dom):
        bpy.ops.fluid.bake_all()
    print("BAKED", time.time() - t, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, "fluid.blend"))
