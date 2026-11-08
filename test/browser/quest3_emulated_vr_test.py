# Requires Playwright + Chrome, and a test page public/vr-test.html that loads Meta IWER
# (npm i iwer; copy node_modules/iwer/build/iwer.module.js to public/vendor/iwer-test.js;
#  vr-test.html = index.html plus a module script: new XRDevice(metaQuest3).installRuntime({forceInstall:true})).
# Remove both files again before deploying.
import asyncio, json
from playwright.async_api import async_playwright
URL='http://localhost:3000'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
HELP = """
window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
window.__hands = (l, r) => { const c = __xr.controllers; c.left.position.set(...l); c.right.position.set(...r); };
window.__rig = () => { const p = __cc.rig.position; return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), +__cc.rig.rotation.y.toFixed(3)]; };
0;
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        A = await b.new_page(viewport={'width':640,'height':400}); B = await b.new_page(viewport={'width':800,'height':500})
        errs=[]
        for t,pg in (('A',A),('B',B)):
            pg.on('pageerror', lambda e, t=t: errs.append(f'{t} {e} {(e.stack or "")[:300]}'))
            pg.on('console', lambda m, t=t: errs.append(f'{t} console.{m.type}: {m.text}') if m.type=='error' else None)
        await A.goto(URL); await A.wait_for_timeout(2000)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(800)
        code = await A.inner_text('#lobby-code')
        await B.goto(URL + '/vr-test.html?room=' + code); await B.wait_for_timeout(2500)
        print('VR supported (emulated Quest 3):', await B.evaluate('__cc.G.vrSupported'))
        await B.click('[data-action=join]'); await B.wait_for_timeout(1000)
        await B.evaluate(HELP)
        await B.click('[data-action=vr]'); await B.wait_for_timeout(1500)
        print('presenting:', await B.evaluate('__cc.renderer.xr.isPresenting'), 'view:', await B.evaluate('__cc.G.view'))
        print('controllers connected:', await B.evaluate('Object.keys(__cc.vrInput.hands)'))
        # stand: hands at sides
        await B.evaluate('__hands([-0.25, 0.9, -0.1], [0.25, 0.9, -0.1])')
        await B.wait_for_timeout(1500)
        r0 = await B.evaluate('__rig()'); print('rig at start', r0, 'mode', await B.evaluate('__cc.G && JSON.parse(localStorage.cc_settings||"{}").moveMode || "gorilla"'))
        # gorilla crouch: hands at floor level -> body settles held up by hands
        await B.evaluate('__hands([-0.25, 0.8, -0.4], [0.25, 0.8, -0.4])'); await B.wait_for_timeout(1500)
        r1 = await B.evaluate('__rig()'); print('after planting hands', r1, 'touching', await B.evaluate('__cc.vrMover.gorilla.hands.map(h=>h.touching)'))
        # PUSH: drag both hands backward along the ground (toward +z of the headset)
        await B.evaluate("""(async () => { for (let i = 0; i <= 20; i++) { const z = -0.4 + i * 0.04; __hands([-0.25, 0.8, z], [0.25, 0.8, z]); await __sleep(30); } })()""")
        await B.wait_for_timeout(100)
        r2 = await B.evaluate('__rig()'); print('after push back', r2, 'vel', await B.evaluate('__cc.vrMover.gorilla.vel.toArray().map(v=>+v.toFixed(2))'))
        # lift hands -> release, keep momentum
        await B.evaluate('__hands([-0.25, 1.2, 0.3], [0.25, 1.2, 0.3])'); await B.wait_for_timeout(600)
        r3 = await B.evaluate('__rig()'); print('after release (momentum)', r3)
        # JUMP: plant then shove down hard
        await B.evaluate('__hands([-0.25, 0.85, -0.3], [0.25, 0.85, -0.3])'); await B.wait_for_timeout(1500)
        j0 = await B.evaluate('__rig()')
        await B.evaluate("""(async () => { for (let i = 0; i <= 8; i++) { const y = 0.85 - i * 0.06; __hands([-0.25, y, -0.3], [0.25, y, -0.3]); await __sleep(25); } __hands([-0.25, 1.3, -0.3], [0.25, 1.3, -0.3]); })()""")
        await B.wait_for_timeout(120)
        j1 = await B.evaluate('__rig()'); vj = await B.evaluate('__cc.vrMover.gorilla.vel.toArray().map(v=>+v.toFixed(2))')
        print('jump: rig y', j0[1], '->', j1[1], 'velocity', vj)
        await B.wait_for_timeout(1500)
        print('landed rig', await B.evaluate('__rig()'))
        # FRAME-SYNCED launch tests (hands move every rendered frame, like a real player)
        script = '''(mode) => new Promise(res => {
          let f = 0; const seq = [];
          if (mode === 'jump') { for (let i = 0; i < 12; i++) seq.push(0.85); for (let i = 1; i <= 6; i++) seq.push(0.85 - i * 0.07); seq.push('release'); }
          else { for (let i = 0; i < 12; i++) seq.push(-0.4); for (let i = 1; i <= 8; i++) seq.push(-0.4 + i * 0.09); seq.push('release'); }
          let rel = null;
          window.__frameHook = () => {
            const v = seq[f++];
            if (v === undefined) { window.__frameHook = null; res(rel); return; }
            if (v === 'release') { __hands([-0.25, 1.35, 0.3], [0.25, 1.35, 0.3]); setTimeout(() => { rel = __cc.vrMover.gorilla.vel.toArray().map(x => +x.toFixed(2)); }, 0); return; }
            if (mode === 'jump') __hands([-0.25, v, -0.3], [0.25, v, -0.3]); else __hands([-0.25, 0.85, v], [0.25, 0.85, v]);
          };
        })'''
        await B.wait_for_timeout(1500)
        j0 = await B.evaluate('__rig()')
        vel = await B.evaluate(f'({script})("jump")')
        await B.wait_for_timeout(150)
        print('FRAME-SYNCED JUMP: launch velocity', vel, 'rig y', j0[1], '->', (await B.evaluate('__rig()'))[1])
        await B.wait_for_timeout(1500)
        await B.evaluate("__hands([-0.25, 0.85, -0.3], [0.25, 0.85, -0.3])"); await B.wait_for_timeout(1200)
        s0 = await B.evaluate('__rig()')
        vel = await B.evaluate(f'({script})("run")')
        await B.wait_for_timeout(400)
        s1 = await B.evaluate('__rig()')
        print('FRAME-SYNCED RUN: launch velocity', vel, 'moved', round(((s1[0]-s0[0])**2+(s1[2]-s0[2])**2)**0.5, 2), 'm')
        # SNAP TURN
        rot0 = (await B.evaluate('__rig()'))[3]
        await B.evaluate("__xr.controllers.right.updateAxes('thumbstick', 1, 0)"); await B.wait_for_timeout(300)
        await B.evaluate("__xr.controllers.right.updateAxes('thumbstick', 0, 0)"); await B.wait_for_timeout(300)
        print('snap turn rotation', rot0, '->', (await B.evaluate('__rig()'))[3])
        # SHOOT with right trigger
        before = await B.evaluate('__cc.weapons.current.mag')
        await B.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await B.wait_for_timeout(300)
        await B.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)"); await B.wait_for_timeout(600)
        print('VR trigger shot: mag', before, '->', await B.evaluate('__cc.weapons.current.mag'), '(server-confirmed inventory)')
        # RELOAD with A
        await B.evaluate("__xr.controllers.right.updateButtonValue('a-button', 1)"); await B.wait_for_timeout(200)
        await B.evaluate("__xr.controllers.right.updateButtonValue('a-button', 0)")
        print('A button reload:', await B.evaluate('__cc.weapons.reloading'))
        await B.wait_for_timeout(300)
        await B.screenshot(path='/tmp/shots/13_vr_view.png')
        # MENU with Y
        await B.evaluate("__xr.controllers.left.updateButtonValue('y-button', 1)"); await B.wait_for_timeout(200)
        await B.evaluate("__xr.controllers.left.updateButtonValue('y-button', 0)"); await B.wait_for_timeout(500)
        print('Y opens VR menu:', await B.evaluate('__cc.vrui ? __cc.vrui.menuOpen : "n/a"'))
        await B.screenshot(path='/tmp/shots/14_vr_menu.png')
        # A sees B as a VR player?
        await A.wait_for_timeout(500)
        print('A sees B vr flag:', await A.evaluate('[...__cc.remote.players.values()].map(p => p.buf.length ? p.buf[p.buf.length-1].a[25] : null)'))
        print('errors:', errs[:6] or 'none')
        await b.close()
asyncio.run(main())
