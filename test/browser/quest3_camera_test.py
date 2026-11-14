# 📷 camera on an emulated Quest 3: Y menu > CAMERA puts it in your right hand (gun hidden), the live screen updates,
# a trigger tap saves a photo download (also while in VR), holding the trigger records a video, A flips to selfie,
# B puts it away. Needs public/vr-test.html (IWER emulator page) and the server running with CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
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
        # trigger tap
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await P.wait_for_timeout(250)
        await P.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)")
        for _ in range(40):
            if any(d.suggested_filename.endswith('.jpg') for d in dls): break
            await P.wait_for_timeout(1000)
        jp = [d for d in dls if d.suggested_filename.endswith('.jpg')]
        ok(len(jp) >= 1, f'trigger tap saves a photo ({[d.suggested_filename for d in dls]})')
        if jp:
            await jp[0].save_as('/tmp/shots/vrcam_photo.jpg')
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
