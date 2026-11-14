# 📱 Phone: PC (P opens it, shows money/missions, the GPS beam, Esc closes it without pausing) and an emulated Quest 3
# (rolling the left wrist toward your face shows it, tapping WAVE with the right hand sends a wave).
# Needs CC_TEST=1 + vr-test.html.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
os.makedirs('/tmp/shots', exist_ok=True)
AIM = """(() => { const V3 = __cc.camera.position.constructor, ph = __cc.phone;
  const head = __cc.camera.getWorldPosition(new V3()), wp = ph.mesh.getWorldPosition(new V3());
  const n = new V3(0, 0, 1).applyQuaternion(ph.mesh.getWorldQuaternion(ph.mesh.quaternion.clone())), want = head.clone().sub(wp).normalize();
  const fix = ph.mesh.quaternion.clone().setFromUnitVectors(n, want); const q = __xr.controllers.left.quaternion; const Q = ph.mesh.quaternion.constructor;
  const cur = new Q(q.x, q.y, q.z, q.w); cur.premultiply(fix); q.set(cur.x, cur.y, cur.z, cur.w); })()"""
TAP = """(() => { const ph = __cc.phone, b = ph.buttons.find(q => q.app === 'wave'); const W = 0.15, Hh = 0.15 * 820 / 512;
  const u = (b.x + b.w / 2) / 512, v = (b.y + b.h / 2) / 820; const V3 = __cc.camera.position.constructor;
  const want = ph.mesh.localToWorld(new V3((u - 0.5) * W, (0.5 - v) * Hh, 0.01));
  const grip = __cc.vrInput.get('right').grip.getWorldPosition(new V3());   // move the controller so its GRIP lands on the button
  const d = __cc.rig.worldToLocal(want.clone()).sub(__cc.rig.worldToLocal(grip.clone())); const c = __xr.controllers.right.position;
  c.set(c.x + d.x, c.y + d.y, c.z + d.z); })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        errs = []
        A = await (await b.new_context(viewport={'width': 1000, 'height': 680})).new_page(); await A.add_init_script(LOW); A.on('pageerror', lambda e: errs.append('PC ' + str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        await A.mouse.click(500, 300); await A.wait_for_timeout(300)
        await A.keyboard.press('KeyP'); await A.wait_for_timeout(1000)
        print('PC phone open:', await A.evaluate("__cc.phone.isOpen()"), '|', (await A.inner_text('#phone'))[:120].replace('\n', ' / '))
        await A.click('#phone .ph-gps button >> nth=2'); await A.wait_for_timeout(800)
        print('GPS:', await A.evaluate("JSON.stringify(__cc.G.gps)"), '| marker:', await A.evaluate("__cc.marker.root.visible"))
        await A.screenshot(path='/tmp/shots/ph1_pc.png')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        print('closed with Esc:', not await A.evaluate("__cc.phone.isOpen()"), '| view:', await A.evaluate("__cc.G.view"))
        await A.close()
        V = await (await b.new_context(viewport={'width': 900, 'height': 520})).new_page(); await V.add_init_script(LOW); V.on('pageerror', lambda e: errs.append('VR ' + str(e)))
        await V.goto('http://localhost:3000/vr-test.html'); await V.wait_for_selector('[data-goto=create]', state='visible', timeout=90000)
        await V.click('[data-goto=create]'); await V.click('[data-action=create]'); await V.wait_for_timeout(800)
        await V.evaluate(H); await V.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.1, -0.35], [0.25, 1.1, -0.35])")
        await V.click('[data-action=vr]'); await V.wait_for_timeout(4000)
        print('VR phone hidden while playing normally:', not await V.evaluate("__cc.phone.mesh.visible"), '| dot', await V.evaluate("__cc.phone.lastDot"))
        await V.evaluate("(() => { const c = __xr.controllers.left; c.position.set(-0.12, 1.32, -0.3); c.quaternion.set(0, 0, 0.7071, 0.7071); })()"); await V.wait_for_timeout(1500)
        print('rolled wrist: shown', await V.evaluate("__cc.phone.mesh.visible"), '| dot', await V.evaluate("__cc.phone.lastDot"))
        if not await V.evaluate("__cc.phone.mesh.visible"):
            await V.evaluate(AIM); await V.wait_for_timeout(1500)
            print('aimed at the face: shown', await V.evaluate("__cc.phone.mesh.visible"), '| dot', await V.evaluate("__cc.phone.lastDot"))
        await V.evaluate("(() => { const V3 = __cc.camera.position.constructor; const head = __cc.camera.getWorldPosition(new V3()), wp = __cc.phone.mesh.getWorldPosition(new V3()); const d = wp.sub(head).normalize(); const yaw = Math.atan2(-d.x, -d.z), pitch = Math.asin(d.y); const Q = __cc.phone.mesh.quaternion.constructor, E = __cc.rig.rotation.constructor; const q = new Q().setFromEuler(new E(pitch, yaw - __cc.rig.rotation.y, 0, 'YXZ')); __xr.quaternion.set(q.x, q.y, q.z, q.w); })()")
        await V.wait_for_timeout(1500); print('   still shown while looking at it:', await V.evaluate("__cc.phone.mesh.visible"))
        await V.screenshot(path='/tmp/shots/ph2_vr.png')
        await V.evaluate("window.__sent = []; const s0 = __cc.net.send.bind(__cc.net); __cc.net.send = (m) => { if (m && m.type === 'emote') window.__sent.push(m); return s0(m); }")
        await V.evaluate(TAP); await V.wait_for_timeout(1500)
        print('tapped WAVE in VR:', await V.evaluate("JSON.stringify(window.__sent)"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
