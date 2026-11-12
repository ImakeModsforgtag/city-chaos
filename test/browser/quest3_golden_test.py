# Golden Sniper on an emulated Quest 3: grip to buy at the counter, real scope picture on the glass when the
# scope is at your eye, trigger fires, bullet cam moves you with the bullet and puts you back exactly where you were.
# Needs public/vr-test.html (IWER emulator page) and the server running with CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
PLACE = """(x, y, z) => { const cc = __cc; const h = cc.camera.getWorldPosition(new cc.camera.position.constructor()); cc.rig.position.x += x - h.x; cc.rig.position.z += z - h.z; cc.rig.position.y += (y + 0.9) - h.y; cc.vrMover.reset(); }"""
EYE = """(() => { const cc = __cc, V = cc.camera.position.constructor; const m = cc.weapons.model; if (!m || !m.userData.scope) return null;
  cc.rig.updateMatrixWorld(true); const head = cc.camera.getWorldPosition(new V()), eye = m.userData.scope.eye.getWorldPosition(new V());
  const d = head.clone().sub(eye).applyAxisAngle(new V(0, 1, 0), -cc.rig.rotation.y); const c = __xr.controllers.right.position; c.set(c.x + d.x, c.y + d.y, c.z + d.z);
  return +head.distanceTo(eye).toFixed(3); })()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        P = await b.new_page(viewport={'width': 1000, 'height': 560})
        errs = []
        P.on('pageerror', lambda e: errs.append(str(e))); P.on('console', lambda m: errs.append('console: ' + m.text[:300]) if m.type == 'error' else None)
        await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
        await P.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()")
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.evaluate(H)
        await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 0.75, -0.1], [0.25, 0.75, -0.1])")
        await P.click('[data-action=vr]'); await P.wait_for_timeout(1800)
        print('in VR:', await P.evaluate('__cc.renderer.xr.isPresenting'))
        await P.evaluate("__cc.net.send({ type: 'testGold' })"); await P.wait_for_timeout(600)
        at = await P.evaluate('__cc.G.gold.at')
        await P.evaluate(f"({PLACE})({at[0]}, {at[1]}, {at[2]} + 0.4)"); await P.wait_for_timeout(7000)
        print('VR prompt at the counter:', await P.evaluate('__cc.G.prompt'))
        await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await P.wait_for_timeout(500)
        await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await P.wait_for_timeout(900)
        print('VR store page:', await P.evaluate('__cc.vrui.model && __cc.vrui.model.title'), '| first item:', await P.evaluate('__cc.vrui.model && __cc.vrui.model.items[0].label'))
        await P.evaluate("__cc.menuAction('shop:buy:golden')"); await P.wait_for_timeout(1200)
        await P.evaluate("__cc.menuAction('shop:close')"); await P.wait_for_timeout(400)
        print('holding:', await P.evaluate('__cc.weapons.current && __cc.weapons.current.w'))
        # open street, looking down it
        await P.evaluate(f"({PLACE})(-120, 0.15, -88)"); await P.wait_for_timeout(7000)
        await P.evaluate("(() => { const cc = __cc, V = cc.camera.position.constructor, h = cc.camera.getWorldPosition(new V()); const yaw = Math.atan2(-30, 0); cc.rig.position.sub(h).applyAxisAngle(new V(0,1,0), yaw - cc.rig.rotation.y).add(h); cc.rig.rotation.y = yaw; })()")
        await P.wait_for_timeout(400)
        await P.evaluate("__hands([-0.2, 1.3, -0.4], [0.05, 1.45, -0.25])"); await P.wait_for_timeout(400)
        for _ in range(4):
            print('scope eye distance from your eye:', await P.evaluate(EYE)); await P.wait_for_timeout(350)
        await P.wait_for_timeout(600)
        print('scope picture on the glass:', await P.evaluate('(() => { const m = __cc.weapons.model; return !!(__cc.gold.rt && m.userData.scope.lens.material.map === __cc.gold.rt.texture); })()'),
              '| reticle:', await P.evaluate('!!(__cc.gold.reticle && __cc.gold.reticle.visible)'),
              '| ESP drawn only in the scope (main camera layer 5):', await P.evaluate('__cc.camera.layers.isEnabled(5)'))
        await P.screenshot(path='/tmp/shots/gv1_scope_at_eye.png')
        print('zoom before:', await P.evaluate('__cc.gold.zoom'))
        await P.evaluate("__xr.controllers.right.updateAxes('thumbstick', 0, -1)"); await P.wait_for_timeout(300)
        await P.evaluate("__xr.controllers.right.updateAxes('thumbstick', 0, 0)"); await P.wait_for_timeout(300)
        print('zoom after flicking the right stick up:', await P.evaluate('__cc.gold.zoom'))
        await P.screenshot(path='/tmp/shots/gv2_scope_zoom.png')
        # fire
        before = await P.evaluate('[__cc.rig.position.x, __cc.rig.position.y, __cc.rig.position.z, __cc.rig.rotation.y]')
        await P.evaluate("window.__heads = []; window.__frameHook = () => { if (__cc.G.bcam) { const h = __cc.camera.getWorldPosition(new __cc.camera.position.constructor()); __heads.push([h.x, h.y, h.z]); } }")
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await P.wait_for_timeout(250)
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)"); await P.wait_for_timeout(150)
        print('VR bullet cam:', await P.evaluate('JSON.stringify(__cc.G.bcam && { xr: __cc.G.bcam.xr })'))
        await P.evaluate("__cc.gold.bc && (__cc.gold.bc.dur = 4)"); await P.wait_for_timeout(1500)
        await P.screenshot(path='/tmp/shots/gv3_vr_bullet_cam.png')
        s1 = await P.evaluate('__cc.G.lastSend'); await P.wait_for_timeout(800)
        print('pose sending paused during the ride:', await P.evaluate('__cc.G.lastSend') == s1, '| still riding:', await P.evaluate('!!__cc.G.bcam'))
        for _ in range(60):
            if await P.evaluate('!__cc.G.bcam'): break
            await P.wait_for_timeout(500)
        after = await P.evaluate('[__cc.rig.position.x, __cc.rig.position.y, __cc.rig.position.z, __cc.rig.rotation.y]')
        heads = await P.evaluate('__heads')
        import math
        travel = max(math.dist(heads[0], h) for h in heads) if heads else 0
        print(f'head travelled with the bullet: {travel:.1f} m over {len(heads)} frames')
        print('back where you were:', [round(a - b, 3) for a, b in zip(after, before)])
        await P.screenshot(path='/tmp/shots/gv4_back.png')
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
