"""Modela os móveis da Minha Casa 3D no Blender e exporta-os para modelos/.

Correr (precisa do Blender 4.2+ ou do módulo bpy):
    blender -b -P blender/moveis.py -- [pasta_saida] [movel1,movel2,...] [--sem-fotos]
    python -c "import bpy" ... ou:  python blender/moveis.py -- modelos

Coordenadas usadas aqui são as do site: x = largura, y = altura (0 = chão),
z = profundidade com a frente do móvel virada para +z. As medidas são em metros
e batem certo com w/d do catálogo ITEMS em casa.js.

Nomes de materiais que o site reconhece (casa.js → modelMat):
    Cor              cor/madeira escolhida pelo utilizador
    Tecido:#hex      tecido      Madeira:carvalho|nogueira|freixo
    Lacado:#hex[:r]  lacado      Metal:#hex[:r]   metal
    Folha:#hex       folhas (duas faces)
    Ceramica Cromado Preto Latao Ecra Espelho Vidro Marmore Agua
    Abajur:cor|#hex  abajur que acende à noite
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FOTOS = '--sem-fotos' not in argv
argv = [a for a in argv if not a.startswith('--')]
OUT = os.path.abspath(argv[0] if argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'modelos'))
ONLY = set(argv[1].split(',')) if len(argv) > 1 else None
PI = math.pi
P = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # site (x, y=cima, z=frente) -> Blender (x, y, z=cima)

# ---------------------------------------------------------------- materiais
WOODHEX = {'carvalho': '#b98b5c', 'nogueira': '#6f4a30', 'freixo': '#d4b891'}
FIXED = {'Ceramica': ('#f3f3f1', .12, 0), 'Cromado': ('#e3e5e8', .12, 1), 'Preto': ('#1e1f22', .45, 0),
         'Latao': ('#b8955a', .35, 1), 'Ecra': ('#06080b', .1, .4), 'Espelho': ('#f2f4f5', .02, 1),
         'Vidro': ('#bcd6de', .03, 0), 'Marmore': ('#eeece7', .14, 0), 'Agua': ('#3d8fc4', .04, 0)}
MATS = {}
ITEM = {}


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def wood_nodes(m, hexc):
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 2.5
    wave.inputs['Distortion'].default_value = 9
    wave.inputs['Detail'].default_value = 4
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    base = lin(hexc)
    ramp.color_ramp.elements[0].color = (*[c * 0.78 for c in base], 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])


def mat(spec):
    """Material com o nome que o site lê; a cor serve só para as fotos."""
    if spec in MATS:
        return MATS[spec]
    t, *a = spec.split(':')
    col, rough, metal, wood = '#808080', .5, 0, None
    if t == 'Cor':
        c = ITEM['cor']
        if c in WOODHEX:
            wood = WOODHEX[c]
        elif c == 'inox':
            col, rough, metal = '#c9ccd0', .3, 1
        else:
            col, rough = c, {'fab': .95, 'kitchen': .3}.get(ITEM['cm'], .4)
    elif t == 'Tecido':
        col, rough = a[0], .95
    elif t == 'Madeira':
        wood = WOODHEX.get(a[0], WOODHEX['carvalho'])
    elif t in ('Lacado', 'Metal', 'Folha'):
        col = a[0]
        rough = float(a[1]) if len(a) > 1 else {'Lacado': .4, 'Metal': .3, 'Folha': .6}[t]
        metal = 1 if t == 'Metal' else 0
    elif t == 'Abajur':
        col, rough = (ITEM['cor'] if a[0] == 'cor' else a[0]), .9
    elif t in FIXED:
        col, rough, metal = FIXED[t]
    m = bpy.data.materials.new(spec)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(col), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if wood:
        wood_nodes(m, wood)
    if t in ('Vidro', 'Agua'):
        b.inputs['Transmission Weight'].default_value = 1
    if t in ('Folha', 'Abajur'):
        m.use_backface_culling = False
    MATS[spec] = m
    return m


# ---------------------------------------------------------------- geometria
def _obj(bm, m, smooth='auto'):
    me = bpy.data.meshes.new('p')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('p', me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat(m))
    o['smooth'] = smooth
    return o


def _apply(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear()
    o.data = me


def _bevel(o, w, seg):
    if w <= 0:
        return
    b = o.modifiers.new('bv', 'BEVEL')
    b.width = w
    b.segments = seg
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(50)
    b.use_clamp_overlap = True
    _apply(o)


def _place(o, x, y, z, rot=None):
    R = Euler(rot, 'XYZ').to_matrix() if rot else Matrix.Identity(3)
    o.matrix_world = Matrix.Translation(P @ Vector((x, y, z))) @ (P @ R @ P.transposed()).to_4x4()


def box(w, h, d, x, y, z, m, bev=.01, seg=3, rot=None, sm='auto'):
    """Caixa w×h×d com a base em y (como B() em casa.js)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    o = _obj(bm, m, sm)
    _bevel(o, min(bev, w * .49, h * .49, d * .49), seg)
    _place(o, x, y + h / 2, z, rot)
    return o


def cyl(rt, rb, h, x, y, z, m, seg=24, caps=True, rot=None, sm='auto', scale=None, bev=0):
    """Cilindro/cone com a base em y (como C() em casa.js)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=rb, radius2=rt, depth=h)
    if scale:
        bmesh.ops.scale(bm, vec=(scale[0], scale[2], scale[1]), verts=bm.verts)
    o = _obj(bm, m, sm)
    _bevel(o, bev, 3)
    _place(o, x, y + h / 2, z, rot)
    return o


def sph(r, x, y, z, m, scale=(1, 1, 1), seg=20, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg * 2 // 3), radius=1)
    bmesh.ops.scale(bm, vec=(r * scale[0], r * scale[2], r * scale[1]), verts=bm.verts)
    o = _obj(bm, m, 'smooth')
    _place(o, x, y, z, rot)
    return o


def lathe(pts, x, y, z, m, seg=32, scale=None, rot=None, closed=False, sm='smooth'):
    """Sólido de revolução: pts = [(raio, altura), ...] a partir de y."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, hh)) for r, hh in pts]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    if closed:
        es.append(bm.edges.new((vs[-1], vs[0])))
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * PI, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if scale:
        bmesh.ops.scale(bm, vec=(scale[0], scale[2], scale[1]), verts=bm.verts)
    o = _obj(bm, m, sm)
    _place(o, x, y, z, rot)
    return o


def ring(R, r, x, y, z, m, seg=40, rot=None):
    """Toro (aro) deitado, centrado em (x, y, z)."""
    pts = [(R + r * math.cos(a), r * math.sin(a)) for a in [i * 2 * PI / 10 for i in range(10)]]
    return lathe(pts, x, y, z, m, seg, rot=rot, closed=True)


def cut(o, cutter):
    b = o.modifiers.new('cut', 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.object = cutter
    b.solver = 'EXACT'
    keep = o.data.materials[0]
    _apply(o)
    o.data.materials.clear()
    o.data.materials.append(keep)
    for poly in o.data.polygons:
        poly.material_index = 0
    return o


def remove(o):
    bpy.data.objects.remove(o, do_unlink=True)


def leaf(x, y, z, m, length, width, yaw, pitch, droop=.35, steps=10):
    """Folha curva (fita com nervura central), presa em (x, y, z)."""
    bm = bmesh.new()
    rows = []
    for i in range(steps + 1):
        t = i / steps
        wv = width * math.sin(PI * min(t * 1.05, 1)) ** .8 / 2
        cy = math.sin(t * PI * .55) * .45 * length - droop * t * t * length
        cz = t * length
        rows.append([bm.verts.new((-wv, cz, cy - wv * .25)), bm.verts.new((0, cz, cy + .004)), bm.verts.new((wv, cz, cy - wv * .25))])
    for i in range(steps):
        for j in range(2):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    o = _obj(bm, m, 'smooth')
    # a folha nasce ao longo de +y do Blender (= -z do site); roda para fora e inclina
    o.matrix_world = Matrix.Translation(P @ Vector((x, y, z))) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'X')
    return o


# ---------------------------------------------------------------- móveis
C, L_NOG, L_CAR = 'Cor', 'Madeira:nogueira', 'Madeira:carvalho'
MODELS = {}


def modelo(k, cor, cm):
    def deco(fn):
        MODELS[k] = (fn, cor, cm)
        return fn
    return deco


def tapered_legs(pts, h, m, rt=.022, rb=.015):
    for x, z in pts:
        cyl(rt, rb, h, x, 0, z, m, 14)


@modelo('sofa', '#7f8b97', 'fab')
def sofa():
    tapered_legs([(-.88, -.35), (.88, -.35), (-.88, .36), (.88, .36)], .12, L_NOG)
    box(1.96, .2, .84, 0, .11, 0, C, .04, 4)
    box(1.96, .5, .2, 0, .14, -.33, C, .06, 4)
    for x in (-.9, .9):
        box(.2, .44, .86, x, .11, 0, C, .08, 5)
    for x in (-.53, 0, .53):
        box(.53, .15, .64, x, .3, .1, C, .06, 5, sm='smooth')
        box(.52, .42, .17, x, .42, -.17, C, .07, 5, rot=(-.16, 0, 0), sm='smooth')
    for x, rz in ((-.6, .18), (.6, -.18)):
        box(.4, .36, .12, x, .45, -.03, 'Tecido:#e8e2d4', .055, 5, rot=(-.2, 0, rz), sm='smooth')


@modelo('poltrona', '#9a5843', 'fab')
def poltrona():
    tapered_legs([(-.36, -.33), (.36, -.33), (-.36, .35), (.36, .35)], .12, L_NOG)
    box(.86, .2, .8, 0, .11, 0, C, .04, 4)
    box(.86, .54, .18, 0, .14, -.33, C, .06, 4)
    for x in (-.38, .38):
        box(.14, .42, .82, x, .11, 0, C, .065, 5)
    box(.6, .14, .62, 0, .3, .08, C, .055, 5, sm='smooth')
    box(.58, .38, .14, 0, .42, -.17, C, .06, 5, rot=(-.15, 0, 0), sm='smooth')


@modelo('mesa_centro', 'carvalho', 'wood')
def mesa_centro():
    box(1.1, .04, .6, 0, .36, 0, C, .015)
    box(1.0, .02, .5, 0, .12, 0, C, .006)
    for x in (-.5, .5):
        for z in (-.25, .25):
            box(.028, .36, .028, x, 0, z, 'Preto', .006)
    box(.24, .03, .17, -.25, .4, 0, 'Tecido:#2f4a6b', .004)
    box(.21, .03, .15, -.25, .43, .01, 'Tecido:#c9b28a', .004)
    lathe([(0, 0), (.035, 0), (.05, .05), (.045, .11), (.022, .16), (.026, .175), (0, .175)], .28, .4, .05, 'Ceramica')


@modelo('movel_tv', 'nogueira', 'wood')
def movel_tv():
    for x in (-.74, .74):
        for z in (-.17, .17):
            cyl(.016, .012, .12, x, 0, z, 'Preto', 12)
    box(1.6, .42, .4, 0, .12, -.01, C, .01)
    for x in (-.6, -.2, .2, .6):
        box(.396, .4, .018, x, .13, .195, C, .004)
        cyl(.005, .005, .1, x + (.17 if x < 0 else -.17), .27, .212, 'Latao', 8)
    box(.32, .015, .2, 0, .54, 0, 'Preto', .005)
    box(.05, .09, .03, 0, .555, -.04, 'Preto', .005)
    box(1.24, .72, .035, 0, .62, -.03, 'Preto', .008)
    box(1.2, .68, .003, 0, .64, -.011, 'Ecra', 0)
    lathe([(0, 0), (.04, 0), (.055, .06), (.04, .16), (.03, .2), (0, .2)], .65, .54, .02, 'Ceramica')


@modelo('tapete', '#c9bfae', 'fab')
def tapete():
    box(2.0, .01, 1.4, 0, 0, 0, C, .004, 2)
    box(1.8, .012, 1.2, 0, 0, 0, 'Tecido:#e7e1d5', .004, 2)
    box(1.5, .013, .9, 0, 0, 0, C, .004, 2)
    for x in [-.99 + i * .045 for i in range(45)]:
        for z in (-.71, .71):
            box(.012, .004, .04, x, 0, z, 'Tecido:#e7e1d5', 0)


@modelo('estante', 'nogueira', 'wood')
def estante():
    for x in (-.4375, .4375):
        box(.025, 1.9, .35, x, 0, 0, C, .004)
    for y in (0, .37, .74, 1.11, 1.48, 1.875):
        box(.85, .025, .33, 0, y, .01, C, .003)
    box(.9, 1.9, .01, 0, 0, -.17, C, 0)
    r = random.Random(7)
    bc = ['#7a2e2a', '#2f4a6b', '#c9b28a', '#3f5a46', '#d8d2c4', '#b5653f', '#2b2c30', '#8a6d9e']
    for y in (.025, .395, .765, 1.135):
        x = -.41
        while x < .38:
            if r.random() < .08:
                x += .07
                continue
            bw, bh = .022 + r.random() * .028, .19 + r.random() * .12
            if x + bw > .41:
                break
            box(bw, bh, .2 + r.random() * .06, x + bw / 2, y, .03, 'Lacado:%s:0.7' % r.choice(bc), .003, 2)
            x += bw + .002
    lathe([(0, 0), (.05, 0), (.065, .08), (.04, .16), (.045, .19), (0, .19)], .15, 1.505, 0, 'Ceramica')
    lathe([(0, 0), (.06, 0), (.07, .1), (0, .1)], -.2, 1.505, 0, 'Lacado:#b5653f:0.8')
    for i in range(7):
        leaf(-.2, 1.6, 0, 'Folha:#4f7d3c', .14 + i % 3 * .03, .045, i * 2.4, .3, .5)


@modelo('candeeiro', '#efe6d2', 'fab')
def candeeiro():
    lathe([(0, 0), (.17, 0), (.17, .012), (.15, .03), (0, .03)], 0, 0, 0, 'Preto', 40, sm='auto')
    cyl(.011, .011, 1.3, 0, .025, 0, 'Preto', 12)
    cyl(.022, .022, .05, 0, 1.3, 0, 'Latao', 16)
    sph(.04, 0, 1.39, 0, 'Lacado:#fff6e6:0.2')
    cyl(.17, .22, .32, 0, 1.28, 0, 'Abajur:cor', 48, caps=False, sm='smooth')
    for yy, rr in ((1.28, .22), (1.6, .17)):
        ring(rr, .004, 0, yy, 0, 'Abajur:cor', 48)


def cozinha(v):
    box(.96, .1, .52, 0, 0, -.04, 'Preto', 0)
    body = box(1.0, .76, .58, 0, .1, -.02, C, .003)
    top = box(1.0, .04, .62, 0, .86, 0, 'Marmore', .006)
    if v == 'sink':
        cutter = box(.5, .4, .38, 0, .72, .02, 'Preto', .04, 4)
        cut(body, cutter)
        cut(top, cutter)
        remove(cutter)
        bowl = box(.5, .18, .38, 0, .72, .02, 'Metal:#b6babe:0.22', .04, 4)
        inner = box(.47, .2, .35, 0, .735, .02, 'Preto', .035, 4)
        cut(bowl, inner)
        remove(inner)
        cyl(.02, .02, .006, 0, .735, .02, 'Cromado', 16)
        cyl(.024, .028, .04, 0, .9, -.24, 'Cromado', 20)
        cyl(.012, .012, .3, 0, .93, -.24, 'Cromado', 16)
        ring(.06, .012, 0, 1.23, -.18, 'Cromado', 24, rot=(0, PI / 2, PI / 2))
        cyl(.011, .009, .08, 0, 1.14, -.12, 'Cromado', 16)
        box(.012, .012, .08, .035, .96, -.22, 'Cromado', .004, rot=(-.4, 0, 0))
    if v == 'stove':
        box(.96, .1, .02, 0, .74, .28, C, .004)
        for x in (-.3, -.15, .15, .3):
            cyl(.018, .018, .02, x, .78, .29, 'Preto', 20, rot=(PI / 2, 0, 0), bev=.003)
        box(.96, .58, .02, 0, .14, .28, C, .004)
        box(.84, .4, .006, 0, .2, .292, 'Lacado:#121316:0.08', .02)
        cyl(.009, .009, .7, 0, .26, .315, 'Cromado', 12, rot=(0, 0, PI / 2))
        box(.62, .006, .52, 0, .9, 0, 'Lacado:#121316:0.08', .01)
        for x, z, r in ((-.15, -.11, .075), (.15, -.11, .06), (-.15, .12, .06), (.15, .12, .075)):
            ring(r, .0025, x, .907, z, 'Lacado:#4a4b50:0.5')
            ring(r * .55, .0025, x, .907, z, 'Lacado:#4a4b50:0.5')
    else:
        box(.996, .17, .02, 0, .68, .28, C, .004)
        cyl(.008, .008, .3, 0, .7, .3, 'Cromado', 12, rot=(0, 0, PI / 2))
        for x in (-.25, .25):
            box(.496, .55, .02, x, .115, .28, C, .004)
        for x in (-.03, .03):
            cyl(.008, .008, .16, x, .5, .3, 'Cromado', 12)


@modelo('bancada', '#f1f0ec', 'kitchen')
def bancada():
    cozinha('plain')


@modelo('lava_loica', '#f1f0ec', 'kitchen')
def lava_loica():
    cozinha('sink')


@modelo('fogao', '#f1f0ec', 'kitchen')
def fogao():
    cozinha('stove')


@modelo('armario_parede', '#f1f0ec', 'kitchen')
def armario_parede():
    box(1.0, .72, .33, 0, 1.45, -.01, C, .003)
    for x in (-.25, .25):
        box(.496, .72, .02, x, 1.45, .165, C, .004)
    for x in (-.03, .03):
        cyl(.007, .007, .18, x, 1.48, .185, 'Cromado', 12)


@modelo('frigorifico', 'inox', 'appl')
def frigorifico():
    box(.7, 1.85, .62, 0, 0, -.03, C, .02)
    box(.69, 1.15, .04, 0, .02, .3, C, .015)
    box(.69, .64, .04, 0, 1.19, .3, C, .015)
    for y0, h in ((1.24, .4), (.62, .5)):
        cyl(.011, .011, h, -.29, y0, .355, 'Cromado', 12)
        for yy in (y0 + .03, y0 + h - .03):
            box(.014, .014, .04, -.29, yy - .007, .335, 'Cromado', .004)


@modelo('mesa_jantar', 'carvalho', 'wood')
def mesa_jantar():
    box(1.6, .04, .9, 0, .72, 0, C, .015)
    box(1.44, .08, .74, 0, .64, 0, C, .004)
    for x in (-.72, .72):
        for z in (-.37, .37):
            cyl(.03, .02, .72, x, 0, z, C, 16)
    lathe([(0, 0), (.07, 0), (.15, .065), (.145, .072), (.06, .022), (0, .022)], 0, .76, 0, 'Ceramica', 40, sm='smooth')
    for x, z in ((-.04, .02), (.05, -.03), (.01, .065), (-.05, -.05)):
        sph(.038, x, .825, z, 'Lacado:#e07b2a:0.5')


@modelo('cadeira', 'nogueira', 'wood')
def cadeira():
    for x in (-.19, .19):
        cyl(.016, .013, .45, x, 0, .2, C, 12)
        cyl(.016, .013, .82, x, 0, -.2, C, 12, rot=(-.06, 0, 0))
    for z in (-.2, .2):
        cyl(.008, .008, .36, 0, .2, z, C, 8, rot=(0, 0, PI / 2))
    box(.45, .035, .46, 0, .45, 0, C, .012)
    box(.4, .03, .4, 0, .48, .01, 'Tecido:#bdb5a7', .012, 4, sm='smooth')
    box(.42, .14, .025, 0, .68, -.225, C, .01, rot=(-.08, 0, 0))
    box(.42, .04, .02, 0, .56, -.215, C, .008, rot=(-.08, 0, 0))


@modelo('cama', '#e7e2d8', 'fab')
def cama():
    tapered_legs([(-.76, -.92), (.76, -.92), (-.76, .98), (.76, .98)], .08, L_CAR, .025, .02)
    box(1.64, .25, 2.0, 0, .08, .02, L_CAR, .015)
    for i in range(5):
        box(.34, .92, .1, -.68 + i * .34, .18, -.98, 'Tecido:#8e9298', .045, 5, sm='smooth')
    box(1.72, .1, .1, 0, .08, -.98, 'Tecido:#8e9298', .03, 3)
    box(1.56, .2, 1.94, 0, .33, .04, 'Tecido:#f2efe8', .04, 4)
    box(1.64, .09, 1.46, 0, .51, .29, C, .045, 5, sm='smooth')
    for x in (-.81, .81):
        box(.03, .26, 1.44, x, .3, .29, C, .012, 3)
    box(1.64, .26, .03, 0, .3, 1.01, C, .012, 3)
    box(1.6, .1, .22, 0, .52, -.52, 'Tecido:#f2efe8', .045, 5, sm='smooth')
    for x in (-.38, .38):
        box(.62, .16, .42, x, .53, -.76, 'Tecido:#f7f5f0', .075, 6, rot=(-.15, 0, 0), sm='smooth')
    box(1.64, .03, .5, 0, .6, .7, 'Tecido:#56654f', .012, 3)


@modelo('mesinha', 'carvalho', 'wood')
def mesinha():
    for x in (-.19, .19):
        for z in (-.16, .16):
            cyl(.012, .01, .08, x, 0, z, 'Preto', 10)
    box(.45, .46, .39, 0, .08, -.005, C, .008)
    box(.43, .2, .015, 0, .32, .19, C, .004)
    sph(.013, 0, .42, .205, 'Latao')
    lathe([(0, 0), (.04, 0), (.065, .045), (.06, .09), (.02, .13), (.012, .14), (0, .14)], .08, .54, -.05, 'Ceramica')
    cyl(.006, .006, .07, .08, .67, -.05, 'Latao', 8)
    cyl(.08, .11, .14, .08, .7, -.05, 'Abajur:#efe6d2', 40, caps=False, sm='smooth')


@modelo('roupeiro', '#f1f0ec', 'wood')
def roupeiro():
    box(1.16, .08, .56, 0, 0, -.01, 'Preto', 0)
    box(1.2, 2.0, .58, 0, .08, -.02, C, .006)
    for x in (-.3, .3):
        box(.597, 1.99, .02, x, .085, .28, C, .004)
    for x in (-.045, .045):
        cyl(.008, .008, .36, x, .93, .315, 'Latao', 12)
        for yy in (.95, 1.27):
            box(.012, .012, .03, x, yy, .298, 'Latao', .003)


@modelo('secretaria', 'carvalho', 'wood')
def secretaria():
    box(1.2, .03, .6, 0, .72, 0, C, .01)
    for x in (-.56, .56):
        for z in (-.26, .26):
            box(.03, .72, .03, x, 0, z, 'Preto', .006)
        box(.03, .03, .52, x, .06, 0, 'Preto', .006)
        box(.03, .03, .52, x, .69, 0, 'Preto', .006)
    box(.22, .012, .16, 0, .75, -.17, 'Preto', .006)
    box(.035, .2, .02, 0, .76, -.2, 'Preto', .006)
    box(.6, .36, .025, 0, .86, -.18, 'Preto', .008)
    box(.57, .33, .003, 0, .875, -.1665, 'Ecra', 0)
    box(.42, .015, .14, 0, .75, .08, 'Lacado:#d9d9d6:0.5', .005)
    sph(.03, .32, .758, .08, 'Lacado:#d9d9d6:0.5', scale=(.8, .45, 1.2))
    lathe([(0, 0), (.035, 0), (.037, .09), (.031, .09), (.031, .008), (0, .008)], -.42, .75, 0, 'Ceramica', 28)
    ring(.025, .006, -.46, .795, 0, 'Ceramica', 20, rot=(PI / 2, 0, 0))


@modelo('cadeira_escritorio', '#3b3e45', 'fab')
def cadeira_escritorio():
    for k in range(5):
        a = k * 2 * PI / 5
        box(.04, .03, .3, math.sin(a) * .15, .04, math.cos(a) * .15, 'Preto', .01, rot=(0, a, 0))
        sph(.025, math.sin(a) * .29, .025, math.cos(a) * .29, 'Preto')
    cyl(.03, .04, .03, 0, .05, 0, 'Preto', 20)
    cyl(.022, .022, .34, 0, .08, 0, 'Cromado', 16)
    box(.3, .03, .3, 0, .4, 0, 'Preto', .01)
    box(.48, .08, .46, 0, .43, .02, C, .035, 5, sm='smooth')
    box(.05, .26, .03, 0, .44, -.245, 'Preto', .01)
    box(.46, .5, .06, 0, .58, -.25, C, .03, 5, rot=(-.08, 0, 0), sm='smooth')
    for x in (-.255, .255):
        box(.025, .2, .03, x, .45, 0, 'Preto', .008)
        box(.05, .025, .24, x, .65, 0, 'Preto', .012)


@modelo('sanita', '#f3f3f1', 'appl')
def sanita():
    box(.38, .36, .17, 0, .42, -.25, 'Ceramica', .03, 4)
    box(.39, .03, .18, 0, .78, -.25, 'Ceramica', .012)
    cyl(.022, .022, .012, 0, .81, -.25, 'Cromado', 16)
    lathe([(0, 0), (.115, 0), (.12, .14), (.16, .3), (.19, .39), (0, .39)], 0, 0, .04, 'Ceramica', 40, scale=(1, 1, 1.3))
    lathe([(0, 0), (.195, 0), (.195, .02), (.19, .03), (0, .03)], 0, .39, .05, 'Ceramica', 40, scale=(1, 1, 1.3))
    box(.25, .3, .1, 0, .3, -.19, 'Ceramica', .04)


@modelo('lavatorio', 'nogueira', 'wood')
def lavatorio():
    box(.6, .48, .42, 0, .32, -.02, C, .006)
    box(.596, .46, .018, 0, .33, .2, C, .004)
    box(.2, .012, .012, 0, .74, .215, 'Cromado', .004)
    top = box(.62, .1, .46, 0, .8, 0, 'Ceramica', .02, 4)
    cutter = box(.46, .1, .3, 0, .84, .035, 'Preto', .045, 5)
    cut(top, cutter)
    remove(cutter)
    cyl(.016, .016, .004, 0, .84, .035, 'Cromado', 16)
    cyl(.018, .02, .03, 0, .9, -.17, 'Cromado', 16)
    cyl(.011, .011, .15, 0, .93, -.17, 'Cromado', 16)
    cyl(.01, .008, .11, 0, 1.025, -.15, 'Cromado', 16, rot=(PI / 2.4, 0, 0))
    cyl(.28, .28, .015, 0, 1.43, -.215, 'Espelho', 48, rot=(PI / 2, 0, 0))
    ring(.285, .012, 0, 1.4375, -.215, 'Latao', 64, rot=(PI / 2, 0, 0))


@modelo('banheira', '#f3f3f1', 'appl')
def banheira():
    tub = box(1.7, .55, .75, 0, 0, 0, 'Ceramica', .05, 5)
    inner = box(1.54, .5, .59, 0, .1, 0, 'Ceramica', .14, 6)
    cut(tub, inner)
    remove(inner)
    cyl(.022, .022, .004, -.6, .1, 0, 'Cromado', 16)
    cyl(.018, .022, .05, .72, .55, -.3, 'Cromado', 16)
    cyl(.012, .012, .1, .72, .6, -.3, 'Cromado', 16)
    cyl(.011, .009, .13, .72, .66, -.24, 'Cromado', 16, rot=(PI / 2.3, 0, 0))
    for x in (.64, .8):
        cyl(.02, .02, .03, x, .55, -.3, 'Cromado', 16)


@modelo('planta', '#b5653f', 'lacq')
def planta():
    lathe([(0, 0), (.13, 0), (.17, .34), (.175, .36), (.16, .36), (.155, .34), (0, .34)], 0, 0, 0, C, 40, sm='auto')
    cyl(.155, .155, .006, 0, .334, 0, 'Lacado:#3b2a1e:1', 32)
    r = random.Random(5)
    greens = ['#3f6b35', '#4f7d3c', '#365e2e', '#5a8a44']
    for k in range(16):
        leaf(0, .34, 0, 'Folha:' + greens[k % 4], .4 + r.random() * .3, .08 + r.random() * .05,
             k * 2.4 + r.random() * .3, .2 + r.random() * .6, .3 + r.random() * .3, 12)


def blob(r, x, y, z, m, seed, jitter=.14, sub=2):
    """Esfera amolgada (copa de árvore, arbusto) com o centro em (x, y, z)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co *= 1 + (rnd.random() - .5) * 2 * jitter
    o = _obj(bm, m, 'flat')
    _place(o, x, y, z)
    return o


# ---------------------------------------------------------------- decoração e jardim
@modelo('planta_alta', '#e9e6df', 'lacq')
def planta_alta():
    lathe([(0, 0), (.15, 0), (.19, .5), (.2, .52), (.18, .52), (0, .5)], 0, 0, 0, C, 40, sm='auto')
    cyl(.18, .18, .006, 0, .494, 0, 'Lacado:#3b2a1e:1', 32)
    r = random.Random(11)
    for k in range(9):
        a, tilt, h = k * 2.4 + r.random() * .4, .15 + r.random() * .3, .5 + r.random() * .55
        dx, dz = math.sin(a) * tilt * h * .5, math.cos(a) * tilt * h * .5
        cyl(.008, .012, h, dx * .5, .5, -dz * .5, 'Folha:#365e2e', 8, rot=(-tilt * math.cos(a) * .5, 0, -tilt * math.sin(a) * .5))
        leaf(dx, .5 + h, -dz, 'Folha:' + ('#3f6b35', '#4f7d3c', '#365e2e')[k % 3], .42 + r.random() * .2, .2 + r.random() * .06,
             a + PI, .25 + r.random() * .45, .2, 12)


@modelo('cato', '#b5653f', 'lacq')
def cato():
    lathe([(0, 0), (.1, 0), (.13, .2), (.135, .21), (.12, .21), (0, .2)], 0, 0, 0, C, 32, sm='auto')
    cyl(.12, .12, .006, 0, .2, 0, 'Lacado:#c9b28a:1', 24)
    g = 'Lacado:#4e7a4a:0.7'
    cyl(.055, .06, .4, 0, .2, 0, g, 12, sm='auto')
    sph(.055, 0, .6, 0, g, seg=12, scale=(1, .8, 1))
    for sx, y0, hh in ((1, .32, .16), (-1, .4, .12)):
        cyl(.03, .03, .07, sx * .07, y0, 0, g, 10, rot=(0, 0, PI / 2))
        cyl(.032, .034, hh, sx * .11, y0 + .015, 0, g, 10, sm='auto')
        sph(.032, sx * .11, y0 + .015 + hh, 0, g, seg=10, scale=(1, .8, 1))


@modelo('arvore', '#4f7d3c', 'leaf')
def arvore():
    bark = 'Lacado:#5a4632:0.95'
    lathe([(0, 0), (.16, 0), (.11, .15), (.09, 1.2), (.075, 1.9), (0, 1.9)], 0, 0, 0, bark, 12, sm='auto')
    for a, t in ((.6, .5), (2.8, .6), (4.6, .45)):
        cyl(.03, .05, .9, math.sin(a) * .2, 1.25, math.cos(a) * .2, bark, 8, rot=(t * math.cos(a), 0, -t * math.sin(a)))
    r = random.Random(3)
    for i in range(11):
        a, rr = r.random() * 2 * PI, r.random() * .6
        blob(.45 + r.random() * .35, math.sin(a) * rr, 2.3 + r.random() * 1.1, math.cos(a) * rr, C, i)


@modelo('arbusto', '#56654f', 'leaf')
def arbusto():
    r = random.Random(4)
    for i in range(7):
        a, rr = r.random() * 2 * PI, r.random() * .2
        blob(.2 + r.random() * .12, math.sin(a) * rr, .25 + r.random() * .2, math.cos(a) * rr, C, 20 + i, .18)


@modelo('floreira', '#8a6d9e', 'lacq')
def floreira():
    pot = box(1.2, .4, .4, 0, 0, 0, 'Lacado:#8f8a82:0.85', .02)
    inner = box(1.14, .4, .34, 0, .06, 0, 'Preto', .01)
    cut(pot, inner)
    remove(inner)
    box(1.14, .01, .34, 0, .32, 0, 'Lacado:#3b2a1e:1', 0)
    r = random.Random(8)
    for i in range(34):
        x, z, h = -.52 + r.random() * 1.04, -.13 + r.random() * .26, .18 + r.random() * .2
        cyl(.004, .005, h, x, .33, z, 'Folha:#56754a', 6)
        cyl(.016, .012, .07, x, .33 + h, z, C, 8, sm='smooth')
    for i in range(14):
        leaf(-.5 + i * .077, .33, (-.1, .1)[i % 2], 'Folha:#4f7d3c', .14, .05, i * 2.4, .6, .2, 8)


@modelo('espreguicadeira', 'carvalho', 'wood')
def espreguicadeira():
    for x in (-.3, .3):
        box(.04, .06, 1.9, x, .26, 0, C, .01)
        for z in (-.85, .85):
            box(.05, .26, .05, x, 0, z, C, .01)
    for i in range(12):
        box(.56, .02, .08, 0, .3, .2 + i * .095 - .4, C, .006)
    box(.62, .07, 1.25, 0, .32, .3, 'Tecido:#e8e2d4', .03, 4, sm='smooth')
    box(.62, .07, .7, 0, .48, -.6, 'Tecido:#e8e2d4', .03, 4, rot=(.75, 0, 0), sm='smooth')
    box(.56, .03, .7, 0, .43, -.63, C, .01, rot=(.75, 0, 0))
    box(.3, .1, .18, 0, .72, -.82, 'Tecido:#7f8b97', .04, 4, rot=(.75, 0, 0), sm='smooth')


# ---------------------------------------------------------------- luzes e jogo
@modelo('candeeiro_teto', '#efe6d2', 'fab')
def candeeiro_teto():
    cyl(.07, .07, .02, 0, 2.68, 0, 'Preto', 32, bev=.004)
    cyl(.003, .003, .38, 0, 2.3, 0, 'Preto', 6)
    cyl(.018, .022, .06, 0, 2.25, 0, 'Latao', 16)
    sph(.045, 0, 2.2, 0, 'Lacado:#fff6e6:0.2')
    lathe([(.02, .3), (.06, .29), (.14, .24), (.2, .14), (.23, .05), (.235, 0)], 0, 2.0, 0, 'Abajur:cor', 48)
    ring(.235, .004, 0, 2.0, 0, 'Latao', 48)


@modelo('interruptor', '#f4f3ef', 'lacq')
def interruptor():
    box(.086, .086, .012, 0, 1.02, -.009, C, .005, 3)
    box(.044, .052, .01, 0, 1.037, .001, C, .004, 3, rot=(.08, 0, 0))
    box(.008, .003, .002, 0, 1.072, .007, 'Lacado:#e07b2a:0.4', 0)


# ---------------------------------------------------------------- mais móveis e acessórios
@modelo('sofa_canto', '#bdb5a7', 'fab')
def sofa_canto():
    # sofá em L: costas atrás (-z), chaise do lado direito a vir para a frente (+z)
    tapered_legs([(-1.25, -.85), (1.25, -.85), (-1.25, -.05), (.45, .85), (1.25, .85)], .12, L_NOG)
    box(2.6, .2, .9, 0, .11, -.45, C, .04, 4)
    box(.9, .2, .9, .85, .11, .45, C, .04, 4)
    box(2.6, .5, .2, 0, .14, -.8, C, .06, 4)
    box(.2, .44, .9, -1.2, .11, -.45, C, .08, 5)
    for x in (-.73, -.02):
        box(.7, .15, .62, x, .3, -.36, C, .06, 5, sm='smooth')
    box(.86, .15, 1.5, .85, .3, .12, C, .06, 5, sm='smooth')
    for x in (-.73, -.02, .85):
        box(.68, .42, .17, x, .42, -.62, C, .07, 5, rot=(-.16, 0, 0), sm='smooth')
    box(.4, .36, .12, -.85, .45, -.48, 'Tecido:#56654f', .055, 5, rot=(-.2, 0, .15), sm='smooth')
    box(.4, .36, .12, .95, .45, -.48, 'Tecido:#e8e2d4', .055, 5, rot=(-.2, 0, -.15), sm='smooth')


@modelo('aparador', 'nogueira', 'wood')
def aparador():
    for x in (-.72, .72):
        for z in (-.17, .17):
            cyl(.018, .012, .18, x, 0, z, 'Preto', 12)
    box(1.6, .62, .42, 0, .18, 0, C, .01)
    for x in (-.6, -.2, .2, .6):
        box(.396, .6, .018, x, .19, .21, C, .004)
        cyl(.006, .006, .12, x + (.16 if x < 0 else -.16), .42, .228, 'Latao', 8)
    lathe([(0, 0), (.06, 0), (.09, .12), (.06, .3), (.04, .36), (.045, .38), (0, .38)], -.5, .8, 0, 'Ceramica')
    box(.26, .04, .2, .1, .8, 0, 'Tecido:#2f4a6b', .004)
    box(.24, .03, .18, .1, .84, .01, 'Tecido:#c9b28a', .004)
    lathe([(0, 0), (.08, 0), (.14, .05), (.13, .06), (.07, .015), (0, .015)], .55, .8, 0, 'Lacado:#b5653f:0.5', 32)


@modelo('lareira', '#eeece7', 'lacq')
def lareira():
    body = box(1.4, 1.1, .45, 0, 0, 0, 'Marmore', .01)
    hole = box(.8, .62, .5, 0, .12, .1, 'Preto', .01)
    cut(body, hole)
    remove(hole)
    box(.8, .62, .02, 0, .12, -.12, 'Lacado:#1b1b1d:0.9', 0)
    box(.8, .02, .32, 0, .12, .02, 'Lacado:#1b1b1d:0.9', 0)
    box(1.6, .06, .52, 0, 1.1, .02, 'Marmore', .01)
    for x, a in ((-.12, .3), (.1, -.25), (0, 0)):
        cyl(.045, .045, .5, x, -.04 + (.06 if a == 0 else 0), 0, 'Madeira:nogueira', 12, rot=(0, a, PI / 2))
    lathe([(0, 0), (.14, 0), (.06, .2), (.02, .3), (0, .3)], 0, .16, 0, 'Abajur:#ff9a45', 16)
    lathe([(0, 0), (.04, 0), (.06, .1), (.03, .22), (0, .22)], -.45, 1.16, 0, 'Ceramica')
    box(.3, .4, .03, .35, 1.16, -.12, 'Preto', .006, rot=(-.08, 0, 0))
    box(.26, .36, .006, .35, 1.18, -.103, 'Lacado:#c9b28a:0.8', 0, rot=(-.08, 0, 0))


@modelo('pufe', '#9a5843', 'fab')
def pufe():
    lathe([(0, 0), (.21, 0), (.24, .04), (.25, .2), (.24, .38), (.2, .42), (0, .42)], 0, 0, 0, C, 40)


@modelo('quadro', '#2d2e31', 'lacq')
def quadro():
    box(1.0, .7, .03, 0, 1.15, -.005, C, .004)
    box(.92, .62, .01, 0, 1.19, .012, 'Lacado:#efe9dd:0.9', 0)
    r = random.Random(21)
    for i, col in enumerate(['#c27a35', '#2f4a6b', '#9a5843', '#56654f', '#e6cd8c']):
        w, h = .15 + r.random() * .25, .12 + r.random() * .25
        box(w, h, .004, -.3 + i * .15 + r.random() * .05, 1.24 + r.random() * .25, .018, 'Lacado:%s:0.9' % col, 0)


@modelo('ilha', '#5b6f5c', 'kitchen')
def ilha():
    box(1.7, .1, .7, 0, 0, 0, 'Preto', 0)
    box(1.74, .76, .74, 0, .1, 0, C, .004)
    for x in (-.58, 0, .58):
        box(.575, .73, .02, x, .115, .38, C, .004)
        cyl(.007, .007, .2, x, .6, .4, 'Cromado', 12, rot=(0, 0, PI / 2))
    box(1.8, .04, .9, 0, .86, 0, 'Marmore', .008)
    lathe([(0, 0), (.07, 0), (.15, .065), (.145, .072), (.06, .022), (0, .022)], .5, .9, 0, 'Ceramica', 32)
    for x, z in ((.47, .02), (.54, -.03), (.5, .06)):
        sph(.036, x, .96, z, 'Lacado:#c0392b:0.4')


@modelo('banco_alto', 'carvalho', 'wood')
def banco_alto():
    for a in range(4):
        ang = a * PI / 2 + PI / 4
        cyl(.012, .012, .66, math.sin(ang) * .14, 0, math.cos(ang) * .14, 'Preto', 10, rot=(math.cos(ang) * .08, 0, -math.sin(ang) * .08))
    ring(.15, .008, 0, .25, 0, 'Preto', 32)
    lathe([(0, 0), (.18, 0), (.185, .02), (.18, .045), (0, .05)], 0, .66, 0, C, 40, sm='auto')


@modelo('mesa_redonda', 'carvalho', 'wood')
def mesa_redonda():
    lathe([(0, 0), (.55, 0), (.555, .015), (.55, .035), (0, .035)], 0, .72, 0, C, 64, sm='auto')
    cyl(.05, .07, .7, 0, .02, 0, C, 24)
    lathe([(0, 0), (.3, 0), (.28, .025), (.08, .04), (0, .04)], 0, 0, 0, 'Preto', 40)
    lathe([(0, 0), (.04, 0), (.05, .05), (.03, .16), (.035, .18), (0, .18)], 0, .755, 0, 'Lacado:#b5653f:0.5')


@modelo('maquina_loica', 'inox', 'appl')
def maquina_loica():
    box(.56, .1, .52, 0, 0, -.04, 'Preto', 0)
    box(.6, .76, .58, 0, .1, -.02, 'Lacado:#e8e8e6:0.4', .003)
    box(.596, .74, .02, 0, .11, .28, C, .006)
    box(.5, .015, .02, 0, .76, .3, 'Cromado', .006)
    box(.6, .04, .62, 0, .86, 0, 'Marmore', .006)


@modelo('cama_solteiro', '#7f8b97', 'fab')
def cama_solteiro():
    tapered_legs([(-.45, -.92), (.45, -.92), (-.45, .98), (.45, .98)], .08, L_CAR, .025, .02)
    box(.97, .25, 2.0, 0, .08, .02, L_CAR, .015)
    box(1.0, .9, .08, 0, .1, -.99, L_CAR, .02)
    box(.9, .2, 1.94, 0, .33, .04, 'Tecido:#f2efe8', .04, 4)
    box(.97, .09, 1.46, 0, .51, .29, C, .045, 5, sm='smooth')
    for x in (-.475, .475):
        box(.03, .26, 1.44, x, .3, .29, C, .012, 3)
    box(.97, .26, .03, 0, .3, 1.01, C, .012, 3)
    box(.94, .1, .22, 0, .52, -.52, 'Tecido:#f2efe8', .045, 5, sm='smooth')
    box(.62, .16, .4, 0, .53, -.76, 'Tecido:#f7f5f0', .075, 6, rot=(-.15, 0, 0), sm='smooth')


@modelo('beliche', 'freixo', 'wood')
def beliche():
    for x in (-.47, .47):
        for z in (-.98, .98):
            box(.06, 1.75, .06, x, 0, z, C, .01)
    for y in (.25, 1.15):
        box(1.0, .14, 2.0, 0, y, 0, C, .01)
        box(.88, .16, 1.9, 0, y + .14, 0, 'Tecido:#f2efe8', .035, 4)
        box(.9, .07, 1.4, 0, y + .3, .25, 'Tecido:#7f8b97', .03, 4, sm='smooth')
        box(.6, .12, .36, 0, y + .3, -.7, 'Tecido:#f7f5f0', .05, 5, sm='smooth')
    for z in (-.98, .98):
        box(1.0, .05, .03, 0, 1.5, z, C, .006)
    box(.03, .06, 1.3, .47, 1.5, -.33, C, .006)
    for y in (.45, .75, 1.05):
        cyl(.014, .014, .3, .53, y, .6, C, 10, rot=(PI / 2, 0, 0))
    for z in (.45, .75):
        box(.04, 1.5, .04, .53, 0, z, C, .008)


@modelo('comoda', 'carvalho', 'wood')
def comoda():
    for x in (-.45, .45):
        for z in (-.2, .2):
            cyl(.016, .012, .12, x, 0, z, 'Preto', 12)
    box(1.0, .75, .48, 0, .12, 0, C, .008)
    for i in range(4):
        y = .14 + i * .18
        box(.96, .165, .018, 0, y, .24, C, .004)
        for x in (-.25, .25):
            sph(.014, x, y + .085, .256, 'Latao')
    box(.3, .02, .2, -.25, .87, 0, 'Lacado:#2f4a6b:0.6', .004)
    lathe([(0, 0), (.05, 0), (.07, .08), (.04, .18), (0, .18)], .3, .87, 0, 'Ceramica')


@modelo('berco', '#f1f0ec', 'wood')
def berco():
    for x in (-.33, .33):
        for z in (-.63, .63):
            box(.04, .9, .04, x, 0, z, C, .008)
    box(.62, .12, 1.22, 0, .22, 0, 'Tecido:#f2efe8', .03, 4)
    box(.66, .03, 1.26, 0, .2, 0, C, .006)
    for z in (-.63, .63):
        box(.66, .04, .03, 0, .86, z, C, .006)
        for x in [-.27 + i * .06 for i in range(10)]:
            box(.018, .5, .018, x, .36, z, C, .004)
    for x in (-.33, .33):
        box(.03, .04, 1.26, x, .86, 0, C, .006)
        for z in [-.57 + i * .063 for i in range(19)]:
            box(.018, .5, .018, x, .36, z, C, .004)
    sph(.07, .1, .43, -.3, 'Tecido:#c9b28a', scale=(1, 1.1, .9))


@modelo('toucador', 'freixo', 'wood')
def toucador():
    for x in (-.46, .46):
        for z in (-.18, .18):
            cyl(.016, .012, .72, x, 0, z, C, 12)
    box(1.0, .14, .45, 0, .6, 0, C, .006)
    box(.96, .1, .02, 0, .62, .23, C, .004)
    sph(.012, 0, .67, .245, 'Latao')
    cyl(.3, .3, .015, 0, 1.12, -.2, 'Espelho', 48, rot=(PI / 2.15, 0, 0))
    ring(.3, .012, 0, 1.13, -.2, 'Latao', 64, rot=(PI / 2.15, 0, 0))
    lathe([(0, 0), (.03, 0), (.035, .08), (.015, .1), (0, .1)], .32, .74, 0, 'Lacado:#d9aaa0:0.3')


@modelo('duche', '#f3f3f1', 'appl')
def duche():
    box(.9, .05, .9, 0, 0, 0, 'Ceramica', .015)
    cyl(.03, .03, .004, 0, .05, 0, 'Cromado', 16)
    box(.9, 2.0, .01, 0, .05, .44, 'Vidro', 0)
    box(.01, 2.0, .9, .44, .05, 0, 'Vidro', 0)
    box(.9, .02, .02, 0, 2.04, .44, 'Cromado', .004)
    box(.02, .02, .9, .44, 2.04, 0, 'Cromado', .004)
    cyl(.011, .011, 1.1, -.4, .95, -.42, 'Cromado', 12)
    cyl(.012, .012, .25, -.4, 2.03, -.3, 'Cromado', 12, rot=(PI / 2, 0, 0))
    cyl(.1, .1, .012, -.4, 2.0, -.18, 'Cromado', 32)
    box(.08, .05, .04, -.4, 1.05, -.42, 'Cromado', .01)


@modelo('maquina_roupa', '#f1f0ec', 'appl')
def maquina_roupa():
    box(.6, .85, .6, 0, 0, 0, C, .02)
    box(.6, .006, .58, 0, .74, .01, 'Preto', 0)
    ring(.19, .025, 0, .4, .3, 'Lacado:#c9ccd0:0.3', 48, rot=(PI / 2, 0, 0))
    cyl(.17, .17, .02, 0, .39, .3, 'Vidro', 48, rot=(PI / 2, 0, 0))
    cyl(.03, .03, .02, .2, .76, .3, 'Cromado', 24, rot=(PI / 2, 0, 0))
    box(.2, .05, .006, -.12, .76, .302, 'Preto', 0)


@modelo('toalheiro', '#e3e5e8', 'appl')
def toalheiro():
    for x in (-.23, .23):
        cyl(.012, .012, .9, x, .55, -.02, 'Cromado', 12)
    for i in range(10):
        cyl(.008, .008, .46, 0, .62 + i * .085 - .23, -.02, 'Cromado', 10, rot=(0, 0, PI / 2))
    box(.4, .45, .012, 0, .8, .005, 'Tecido:#e8e2d4', .004)
    box(.4, .08, .05, 0, 1.22, -.01, 'Tecido:#e8e2d4', .02, 3, sm='smooth')


@modelo('armario_espelho', 'nogueira', 'wood')
def armario_espelho():
    box(.6, .7, .14, 0, 1.2, -.005, C, .006)
    for x in (-.15, .15):
        box(.295, .68, .01, x, 1.21, .068, 'Espelho', .004)
    box(.6, .02, .14, 0, 1.18, -.005, 'Cromado', 0)


@modelo('espelho_parede', '#b8955a', 'lacq')
def espelho_parede():
    cyl(.34, .34, .015, 0, 1.5, -.005, 'Espelho', 64, rot=(PI / 2, 0, 0))
    ring(.35, .016, 0, 1.5075, 0, C, 64, rot=(PI / 2, 0, 0))


@modelo('relogio', '#2d2e31', 'lacq')
def relogio():
    cyl(.2, .2, .03, 0, 1.9, -.01, 'Lacado:#f6f4ef:0.6', 48, rot=(PI / 2, 0, 0))
    ring(.2, .015, 0, 1.915, .0, C, 48, rot=(PI / 2, 0, 0))
    for i in range(12):
        a = i * PI / 6
        box(.008, .03 if i % 3 else .045, .004, math.sin(a) * .165, 1.915 + math.cos(a) * .165 - .015, .008, 'Preto', 0, rot=(0, 0, -a))
    box(.012, .1, .004, .03, 1.9, .012, 'Preto', 0, rot=(0, 0, -1.0))
    box(.008, .15, .004, -.05, 1.89, .015, 'Preto', 0, rot=(0, 0, .6))
    cyl(.012, .012, .01, 0, 1.91, .016, 'Preto', 16, rot=(PI / 2, 0, 0))


@modelo('cortinas', '#e8e2d4', 'fab')
def cortinas():
    cyl(.012, .012, 1.5, 0, 2.38 - .75, .02, 'Cromado', 12, rot=(0, 0, PI / 2))
    for x in (-.76, .76):
        sph(.022, x, 2.39, .02, 'Cromado')
    for sx in (-1, 1):
        for i in range(6):
            cyl(.035, .035, 2.32, sx * (.66 - i * .055), .02, .02 + (i % 2) * .025, C, 10, scale=(1, 1, .7))


@modelo('vaso_flores', '#2f4a6b', 'lacq')
def vaso_flores():
    lathe([(0, 0), (.1, 0), (.15, .15), (.12, .4), (.07, .5), (.08, .52), (0, .52)], 0, 0, 0, C, 40)
    r = random.Random(13)
    for i in range(9):
        a, t, h = r.random() * 2 * PI, .15 + r.random() * .25, .5 + r.random() * .4
        x, z = math.sin(a) * t * h * .6, math.cos(a) * t * h * .6
        cyl(.004, .005, h, x * .5, .48, -z * .5, 'Folha:#56754a', 6, rot=(-t * math.cos(a) * .6, 0, -t * math.sin(a) * .6))
        sph(.04, x, .48 + h, -z, 'Lacado:%s:0.6' % r.choice(['#f2efe8', '#e8b4b8', '#f3d36b']), scale=(1, .8, 1))


@modelo('estante_parede', 'carvalho', 'wood')
def estante_parede():
    box(1.0, .03, .25, 0, 1.4, 0, C, .005)
    r = random.Random(17)
    x = -.45
    while x < .05:
        bw, bh = .025 + r.random() * .02, .17 + r.random() * .08
        box(bw, bh, .17, x + bw / 2, 1.43, .02, 'Lacado:%s:0.7' % r.choice(['#7a2e2a', '#2f4a6b', '#c9b28a', '#3f5a46', '#d8d2c4']), .003, 2)
        x += bw + .002
    lathe([(0, 0), (.04, 0), (.05, .09), (0, .09)], .25, 1.43, 0, 'Lacado:#e9e6df:0.5')
    for i in range(6):
        leaf(.25, 1.52, 0, 'Folha:#4f7d3c', .13, .04, i * 2.4, .4, .7, 8)
    lathe([(0, 0), (.035, 0), (.045, .06), (.03, .14), (0, .14)], .4, 1.43, 0, 'Ceramica')


@modelo('mesa_jardim', 'nogueira', 'wood')
def mesa_jardim():
    lathe([(0, 0), (.5, 0), (.5, .03), (0, .03)], 0, .72, 0, C, 48, sm='auto')
    cyl(.04, .05, .72, 0, 0, 0, 'Preto', 16)
    lathe([(0, 0), (.25, 0), (.22, .03), (0, .03)], 0, 0, 0, 'Preto', 32)
    for k in range(4):
        a = k * PI / 2
        x, z = math.sin(a) * .72, math.cos(a) * .72
        g = 'Lacado:#3b3e45:0.6'
        for sx in (-1, 1):
            for sz in (-1, 1):
                lx, lz = sx * .2, sz * .2
                cyl(.012, .012, .43, x + lx * math.cos(a) + lz * math.sin(a), 0, z - lx * math.sin(a) + lz * math.cos(a), g, 8)
        box(.46, .04, .44, x, .43, z, g, .01, rot=(0, a, 0))
        box(.42, .06, .4, x, .47, z, 'Tecido:#e8e2d4', .025, 4, rot=(0, a, 0), sm='smooth')
        bx, bz = math.sin(a) * .94, math.cos(a) * .94
        box(.46, .4, .03, bx, .45, bz, g, .01, rot=(0, a, 0))


@modelo('guarda_sol', '#e8e2d4', 'fab')
def guarda_sol():
    lathe([(0, 0), (.25, 0), (.25, .06), (.05, .1), (0, .1)], 0, 0, 0, 'Preto', 32)
    cyl(.02, .02, 2.4, 0, .1, 0, 'Madeira:nogueira', 12)
    lathe([(0, 0), (1.2, 0), (1.18, .03), (.05, .5), (0, .52)], 0, 1.95, 0, C, 8, sm='flat')
    lathe([(0, 0), (.06, 0), (.04, .1), (0, .12)], 0, 2.45, 0, 'Madeira:nogueira', 12)


@modelo('churrasqueira', '#a9573a', 'lacq')
def churrasqueira():
    base = box(1.0, .85, .6, 0, 0, 0, C, .01)
    hole = box(.6, .4, .5, 0, .2, .2, 'Preto', .01)
    cut(base, hole)
    remove(hole)
    box(1.04, .05, .64, 0, .85, 0, 'Lacado:#8f8a82:0.85', .01)
    box(.7, .12, .4, 0, .9, -.04, 'Preto', .02)
    for x in [-.32 + i * .04 for i in range(17)]:
        box(.006, .006, .38, x, 1.02, -.04, 'Cromado', 0)
    box(.5, .5, .3, 0, 1.02, -.22, 'Lacado:#8f8a82:0.85', .01)
    box(.2, .4, .2, 0, 1.52, -.27, 'Lacado:#8f8a82:0.85', .01)
    for i in range(5):
        cyl(.04, .04, .5, -.2 + i * .1, .21 + (i % 2) * .08, .25, 'Madeira:nogueira', 10, rot=(PI / 2, 0, 0))


@modelo('piscina', '#3d8fc4', 'lacq')
def piscina():
    # piscina à superfície: borda de pedra e água; 3 x 6 m
    # água 3 x 6 m e borda de 0,3 m à volta (total 3,6 x 6,6 m)
    for z in (-3.15, 3.15):
        box(3.6, .08, .3, 0, 0, z, 'Lacado:#d8d2c4:0.8', .02)
    for x in (-1.65, 1.65):
        box(.3, .08, 6.0, x, 0, 0, 'Lacado:#d8d2c4:0.8', .02)
    box(3.0, .02, 6.0, 0, .02, 0, 'Agua', 0)
    box(2.98, .015, 5.98, 0, 0, 0, 'Lacado:#8fd0e6:0.6', 0)
    for i in range(3):
        box(.6, .02, .25, 1.0, .045 - i * .01, -2.6 + i * .25, 'Lacado:#f2f0ea:0.6', .01)
    for sz in (-1, 1):
        cyl(.018, .018, .7, 1.22, .08, -2.4 + sz * .25, 'Cromado', 12)


# ---------------------------------------------------------------- portas e janelas
# Em coordenadas do troço de parede: x de 0 a 1 ao longo da parede, z = espessura (T = 0.14).
T = .14


@modelo('porta_aro', 'carvalho', 'wood')
def porta_aro():
    tt = T + .03
    for x in (.065, .935):
        box(.03, 2.1, tt, x, 0, 0, C, .004)
    box(.84, .03, tt, .5, 2.07, 0, C, .004)
    for zs in (-1, 1):
        z = zs * (T / 2 + .009)
        for x in (.045, .955):
            box(.07, 2.16, .018, x, 0, z, C, .006)
        box(.84, .07, .018, .5, 2.09, z, C, .006)
        box(.02, .02, .01, .085, 1.05, zs * (tt / 2 - .005), 'Cromado', .004)


@modelo('porta_folha', 'carvalho', 'wood')
def porta_folha():
    # no referencial da dobradiça: x de 0 a 0.83, z de 0 a 0.04
    leaf_ = box(.83, 2.05, .04, .415, .025, .02, C, .004)
    for y0, h in ((.18, .8), (1.15, .78)):
        for z in (.04, 0):
            c_ = box(.58, h, .012, .415, y0, z, 'Preto', .01)
            cut(leaf_, c_)
            remove(c_)
    for z, s in ((.04, 1), (0, -1)):
        cyl(.026, .026, .012, .74, .99, z + s * .006, 'Cromado', 24, rot=(PI / 2, 0, 0))
        cyl(.009, .009, .05, .74, 1.0 - .025, z + s * .03, 'Cromado', 12, rot=(PI / 2, 0, 0))
        box(.13, .018, .02, .69, .99, z + s * .055, 'Cromado', .008)
        cyl(.012, .012, .012, .74, .87, z + s * .006, 'Cromado', 16, rot=(PI / 2, 0, 0))


@modelo('janela', '#f0f0ee', 'lacq')
def janela():
    for x in (.125, .875):
        box(.05, 1.2, .07, x, .95, 0, C, .006)
    for y in (.95, 2.1):
        box(.7, .05, .07, .5, y, 0, C, .006)
    for x0 in (.15, .5):
        xc = x0 + .175
        for x in (xc - .1525, xc + .1525):
            box(.045, 1.1, .05, x, 1.0, .005, C, .005)
        for y in (1.0, 2.055):
            box(.26, .045, .05, xc, y, .005, C, .005)
        box(.26, 1.01, .006, xc, 1.045, .005, 'Vidro', 0)
    for zs in (-1, 1):
        box(.012, .14, .02, .5 + zs * .02, 1.5, zs * .037, 'Cromado', .004)
    box(.88, .035, T + .09, .5, .915, 0, 'Marmore', .006)
    box(.88, .012, .02, .5, .905, (T + .09) / 2 - .02, 'Marmore', .003)


@modelo('envidracado', '#f0f0ee', 'lacq')
def envidracado():
    for x in (.0725, .9275):
        box(.045, 2.34, .07, x, .06, 0, C, .006)
    for y in (.06, 2.355):
        box(.81, .045, .07, .5, y, 0, C, .006)
    for i, (xc, z) in enumerate(((.29, -.012), (.71, .012))):
        for x in (xc - .2, xc + .2):
            box(.04, 2.24, .03, x, .105, z, C, .005)
        for y in (.105, 2.305):
            box(.36, .04, .03, xc, y, z, C, .005)
        box(.38, 2.16, .006, xc, .145, z, 'Vidro', 0)
        box(.012, .3, .02, xc + (.17 if i == 0 else -.17), 1.0, z + (-.025 if i == 0 else .025), 'Cromado', .004)


# ---------------------------------------------------------------- exportar
def reset():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll):
            coll.remove(d)
    MATS.clear()


def finish():
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in objs:
        me = o.data
        if o['smooth'] == 'flat':
            me.shade_flat()
        else:
            me.shade_smooth()
            if o['smooth'] == 'auto':
                me.set_sharp_from_angle(angle=math.radians(40))
        me.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    o = objs[0]
    me = o.data
    uv = me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v.x, v.y) if ax == 2 else (v.y, v.z) if ax == 0 else (v.x, v.z)
    return o


def foto(o, path):
    sc = bpy.context.scene
    bb = [Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr, rad = (lo + hi) / 2, (hi - lo).length / 2
    d = Vector((1.0, -1.7, .95)).normalized()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.lens = 50
    cam.location = ctr + d * rad / math.tan(math.radians(14.5))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(12)
    sun.rotation_euler = (math.radians(40), 0, math.radians(35))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    floor = bpy.data.objects.new('chao', bpy.data.meshes.new('chao'))
    bm.to_mesh(floor.data)
    bm.free()
    sc.collection.objects.link(floor)
    floor.is_shadow_catcher = True
    w = bpy.data.worlds.new('mundo')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.8, .84, .9, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = .9
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 40
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 320, 240
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(os.path.join(OUT, 'fotos'), exist_ok=True)
    for k, (fn, cor, cm) in MODELS.items():
        if ONLY and k not in ONLY:
            continue
        reset()
        ITEM.clear()
        ITEM.update(cor=cor, cm=cm)
        fn()
        o = finish()
        for x in bpy.context.scene.objects:
            x.select_set(x == o)
        bpy.context.view_layer.objects.active = o
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, k + '.glb'), export_format='GLB', use_selection=True,
                                  export_materials='EXPORT', export_cameras=False, export_lights=False, export_yup=True)
        print('modelo', k, len(o.data.vertices), 'vértices')
        if FOTOS:
            foto(o, os.path.join(OUT, 'fotos', k + '.png'))


main()
