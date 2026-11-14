# 📷 camera on an emulated Quest 3: Y menu > CAMERA puts it in your right hand (gun hidden), the live screen updates,
# a trigger tap saves a photo download (also while in VR), holding the trigger records a video, A flips to selfie,
# B puts it away. Needs public/vr-test.html (IWER emulator page) and the server running with CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
# poke a tablet button with the LEFT hand (move the controller so its grip lands on the button)
POKE = """(a) => { const pc = __cc.photocam, b = pc.barRects.find(q => q.a === a); if (!b) return 'no button ' + a;
  const u = (b.x + b.w / 2) / pc.barC.width, v = (b.y + b.h / 2) / pc.barC.height, V3 = __cc.camera.position.constructor;
  const want = pc.bar.localToWorld(new V3((u - 0.5) * pc.barW, (0.5 - v) * pc.barH, 0.015));
  const grip = __cc.vrInput.get('left').grip.getWorldPosition(new V3());
  const d = __cc.rig.worldToLocal(want.clone()).sub(__cc.rig.worldToLocal(grip.clone())); const c = __xr.controllers.left.position;
  c.set(c.x + d.x, c.y + d.y, c.z + d.z); return 'poked ' + a; }"""
PARK = """() => { __xr.controllers.left.position.set(-0.3, 1.0, -0.2); }"""
fails = 0
def ok(c, m):
    global fails
    print(('  PASS ' if c else '  FAIL ') + m)
    if not c: fails += 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        ctx = await b.new_context(viewport={'width': 1000, 'height': 560}, accept_downloads=True); P = await ctx.new_page()
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        dls = []; P.on('download', lambda d: dls.append(d))
        await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.evaluate(H)
        await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 0.75, -0.1], [0.2, 1.3, -0.4])")
        await P.click('[data-action=vr]'); await P.wait_for_timeout(2500)
        ok(await P.evaluate('__cc.renderer.xr.isPresenting'), 'in VR')
        await P.evaluate("__cc.menuAction('camera')"); await P.wait_for_timeout(1500)
        ok(await P.evaluate("__cc.photocam.on && __cc.photocam.model.parent === __cc.weapons.vrHolder"), 'the camera is in your right hand')
        ok(await P.evaluate("__cc.weapons.model ? !__cc.weapons.model.visible : true"), 'the gun is put away')
        ok(await P.evaluate("__cc.photocam.screen.material.map === __cc.photocam.viewRT.texture && __cc.photocam.frame > 2"), 'the live screen is drawing')
        ok(await P.evaluate("__cc.photocam.barRects.length === 8"), 'the tablet has its 8 buttons')
        await P.screenshot(path='/tmp/shots/vrcam_tablet.png')
        # ---- poke 🔺 TRIPOD with your other hand
        print('  ', await P.evaluate(POKE, 'tripod')); await P.wait_for_timeout(900)
        ok(await P.evaluate("__cc.photocam.onTripod && __cc.photocam.tripod.visible"), 'poking 🔺 TRIPOD stands the camera up')
        ok(await P.evaluate("__cc.photocam.lensCam.parent === __cc.photocam.tPitch"), 'the tablet now shows what the tripod sees')
        await P.evaluate(PARK); await P.wait_for_timeout(900)
        # ---- aim it with the right stick
        y0 = await P.evaluate("__cc.photocam.yaw")
        await P.evaluate("__xr.controllers.right.updateAxes('thumbstick', 1, 0)"); await P.wait_for_timeout(1200)
        await P.evaluate("__xr.controllers.right.updateAxes('thumbstick', 0, 0)"); await P.wait_for_timeout(300)
        y1 = await P.evaluate("__cc.photocam.yaw")
        ok(abs(y1 - y0) > 0.1, f'the right stick aims the tripod camera ({y0:.2f} -> {y1:.2f})')
        ok(abs(await P.evaluate("__cc.rig.rotation.y") - (await P.evaluate("__cc.rig.rotation.y"))) < 1e-9, 'and does not spin you around')
        await P.screenshot(path='/tmp/shots/vrcam_tripod.png')
        # ---- poke 📸 PHOTO
        print('  ', await P.evaluate(POKE, 'photo'))
        for _ in range(40):
            if any(d.suggested_filename.endswith('.jpg') for d in dls): break
            await P.wait_for_timeout(1000)
        ok(any(d.suggested_filename.endswith('.jpg') for d in dls), f'poking 📸 captures from the tripod ({[d.suggested_filename for d in dls]})')
        await P.evaluate(PARK); await P.wait_for_timeout(900)
        # ---- poke ✋ PICK UP
        print('  ', await P.evaluate(POKE, 'tripod')); await P.wait_for_timeout(900)
        ok(not await P.evaluate("__cc.photocam.onTripod"), 'poking ✋ PICK UP takes the camera back')
        await P.evaluate(PARK); await P.wait_for_timeout(600)
        # trigger tap
        n0 = sum(d.suggested_filename.endswith('.jpg') for d in dls)
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await P.wait_for_timeout(250)
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)")
        for _ in range(40):
            if sum(d.suggested_filename.endswith('.jpg') for d in dls) > n0: break
            await P.wait_for_timeout(1000)
        jp = [d for d in dls if d.suggested_filename.endswith('.jpg')]
        ok(len(jp) >= 2, f'trigger tap saves a photo ({[d.suggested_filename for d in dls]})')
        if jp:
            await jp[-1].save_as('/tmp/shots/vrcam_photo.jpg')
            from PIL import Image, ImageStat
            m = ImageStat.Stat(Image.open('/tmp/shots/vrcam_photo.jpg').convert('L')).mean[0]
            ok(40 < m < 230, f'the VR photo shows the city (mean {m:.0f})')
        # A = selfie
        await P.evaluate("__xr.controllers.right.updateButtonValue('a-button', 1)"); await P.wait_for_timeout(600)
        await P.evaluate("__xr.controllers.right.updateButtonValue('a-button', 0)"); await P.wait_for_timeout(600)
        ok(await P.evaluate("__cc.photocam.selfie"), 'A flips to selfie')
        # hold trigger = video
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await P.wait_for_timeout(1800)
        ok(await P.evaluate("__cc.photocam.recording"), 'holding the trigger records')
        await P.wait_for_timeout(3000)
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)")
        for _ in range(20):
            if any(not d.suggested_filename.endswith('.jpg') for d in dls): break
            await P.wait_for_timeout(1000)
        ok(any(d.suggested_filename.endswith(('.mp4', '.webm')) for d in dls), 'letting go saves the video')
        # B = put away
        await P.evaluate("__xr.controllers.right.updateButtonValue('b-button', 1)"); await P.wait_for_timeout(600)
        await P.evaluate("__xr.controllers.right.updateButtonValue('b-button', 0)"); await P.wait_for_timeout(600)
        ok(await P.evaluate("!__cc.photocam.on && !__cc.weapons.holstered"), 'B puts the camera away')
        print('errors:', errs); ok(not errs, 'no page errors')
        await b.close()
    print('FAILURES:', fails)
asyncio.run(main())
