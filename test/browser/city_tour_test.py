# City tour: screenshots of every district from the air and from street level, plus render stats.
# Usage: python3 test/browser/city_tour_test.py [prefix]
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
PRE = sys.argv[1] if len(sys.argv) > 1 else 'tour'
os.makedirs('/tmp/shots', exist_ok=True)
# name: (camera position, look-at point)
SHOTS = {
  'overview':     ([-150, 120, 170], [0, 0, 0]),
  'downtown':     ([30, 40, -20], [80, 20, -90]),
  'shopping':     ([-40, 18, -40], [-70, 2, -80]),
  'police':       ([20, 14, -40], [28, 2, -80]),
  'park':         ([-60, 14, -2], [-84, 0, -30]),
  'residential':  ([-2, 16, 54], [-28, 2, 84]),
  'services':     ([110, 16, 58], [84, 4, 30]),
  'street':       ([-3, 1.7, -30], [-3, 1.5, -100]),
  'intersection': ([10, 1.7, 14], [-6, 1.2, -6]),
  'house_street': ([-3.5, 1.7, 112], [-40, 2, 104]),
  'skyline':      ([0, 2, 20], [0, 20, -120]),
}
DETAIL = {
  'd_watertower':  ([-16, 9, 76], [-28, 12, 84]),
  'd_firestation': ([97, 4, -2], [97, 3, 14]),
  'd_hospital':    ([60, 6, 72], [48, 8, 76]),
  'd_mechanic':    ([-30, 3, 58], [-28, 2, 40]),
  'd_tower_base':  ([72, 3, -68], [72, 6, -86]),
  'd_signal':      ([-4, 2.2, -38], [0, 5, -52]),
  'd_busstop':     ([-20, 1.7, -58], [-19, 1.4, -64]),
  'd_house':       ([-44, 2.2, 58], [-40, 3, 70]),
}
if len(sys.argv) > 2 and sys.argv[2] == 'detail': SHOTS = DETAIL

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        pg = await b.new_page(viewport={'width': 1100, 'height': 640})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console: ' + m.text[:300]) if m.type == 'error' else None)
        await pg.goto('http://localhost:3000'); await pg.wait_for_timeout(3000)
        await pg.click('[data-goto=create]'); await pg.click('[data-action=create]'); await pg.wait_for_timeout(800)
        await pg.click('[data-action=desktop]'); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.getElementById('hud').style.visibility='hidden'")
        for name, (pos, look) in SHOTS.items():
            await pg.evaluate(f"window.__camOverride = {{ p: {json.dumps(pos)}, l: {json.dumps(look)} }}")
            await pg.wait_for_timeout(1400)
            info = await pg.evaluate("({ calls: __cc.renderer.info.render.calls, tris: __cc.renderer.info.render.triangles })")
            print(f'{name:13s} draw calls {info["calls"]:4d}  triangles {info["tris"]:7d}')
            await pg.screenshot(path=f'/tmp/shots/{PRE}_{name}.png')
        total = await pg.evaluate("(() => { let t = 0, m = 0; __cc.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position) { m++; t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return { meshes: m, tris: Math.round(t) }; })()")
        print('whole scene:', total)
        print('city:', await pg.evaluate("JSON.stringify({ stats: __cc.city.stats, groups: [__cc.city.solidMesh, __cc.city.flatMesh, __cc.city.glowMesh, ...__cc.city.extra].map(g => g.name + ':' + g.children.length), labels: __cc.city.signs.children.length, anim: (() => { let n = 0; __cc.city.anim.root.traverse(o => { if (o.isMesh) n++; }); return n; })() })"))
        print('ERRORS:', errs[:5])
        await b.close()
asyncio.run(main())
