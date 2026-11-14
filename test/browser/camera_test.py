# 📷 camera in the browser (PC): V takes it out, a click saves a JPG photo download, holding the mouse records a
# video download, F flips to selfie (you're in the picture), the phone's Photos app lists them, V puts it away and
# the gun comes back. Needs CC_TEST=1 on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
fails = 0
def ok(c, m):
    global fails
    print(('  PASS ' if c else '  FAIL ') + m)
    if not c: fails += 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 1100, 'height': 700}, accept_downloads=True)
        A = await ctx.new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        downloads = []
        A.on('download', lambda d: downloads.append(d))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [28, 0.15, 2], yaw: 0.6 }); __cc.net.send({ type: 'testClock', hour: 12, weather: 'clear' })"); await A.wait_for_timeout(2500)
        await A.keyboard.press('KeyV'); await A.wait_for_timeout(1200)
        ok(await A.evaluate("__cc.photocam.on && __cc.weapons.holstered"), 'V takes out the camera (gun put away)')
        ok(await A.evaluate("__cc.weapons.model ? !__cc.weapons.model.visible : true"), 'the gun is hidden')
        await A.screenshot(path='/tmp/shots/cam_held.png')
        # photo: a short click (use the API to avoid pointer lock trouble in headless)
        await A.evaluate("__cc.desk.mouse.leftPressed = true")
        for _ in range(30):
            if any(d.suggested_filename.endswith(".jpg") for d in downloads): break
            await A.wait_for_timeout(1000)
        photo = [d for d in downloads if d.suggested_filename.endswith('.jpg')]
        ok(len(photo) == 1, f'a photo download ({[d.suggested_filename for d in downloads]})')
        if photo:
            await photo[0].save_as('/tmp/shots/cam_photo.jpg')
            from PIL import Image, ImageStat
            im = Image.open('/tmp/shots/cam_photo.jpg'); st = ImageStat.Stat(im.convert('L'))
            ok(im.size == (1600, 1200), f'photo is 1600x1200 ({im.size})')
            ok(60 < st.mean[0] < 220, f'photo is properly exposed, not black or washed out (mean {st.mean[0]:.0f})')
        # selfie
        await A.keyboard.press('KeyF'); await A.wait_for_timeout(800)
        ok(await A.evaluate("__cc.photocam.selfie"), 'F flips to selfie mode')
        await A.evaluate("__cc.desk.mouse.leftPressed = true")
        for _ in range(30):
            if sum(d.suggested_filename.endswith(".jpg") for d in downloads) >= 2: break
            await A.wait_for_timeout(1000)
        selfies = [d for d in downloads if d.suggested_filename.endswith('.jpg')]
        if len(selfies) >= 2: await selfies[1].save_as('/tmp/shots/cam_selfie.jpg')
        ok(len(selfies) >= 2, 'a selfie photo download')
        await A.keyboard.press('KeyF'); await A.wait_for_timeout(300)
        # video: hold for a few seconds
        vt = await A.evaluate("String(window.MediaRecorder ? (MediaRecorder.isTypeSupported('video/mp4') ? 'mp4' : 'webm') : 'none')")
        print('   recorder:', vt)
        t0 = await A.evaluate("performance.now() / 1000")
        await A.evaluate("__cc.desk.mouse.left = true"); await A.wait_for_timeout(1500)
        ok(await A.evaluate("__cc.photocam.recording"), 'holding starts recording')
        await A.wait_for_timeout(4000)
        await A.evaluate("__cc.desk.mouse.left = false"); await A.wait_for_timeout(4000)
        vids = [d for d in downloads if d.suggested_filename.endswith('.mp4') or d.suggested_filename.endswith('.webm')]
        ok(len(vids) == 1, f'a video download ({[d.suggested_filename for d in vids]})')
        if vids:
            await vids[0].save_as('/tmp/shots/cam_video.' + vids[0].suggested_filename.split('.')[-1])
            ok(os.path.getsize('/tmp/shots/cam_video.' + vids[0].suggested_filename.split('.')[-1]) > 2000, 'the video has data')
        # photos app
        await A.evaluate("__cc.phone.open()"); await A.wait_for_timeout(400)
        await A.click('#phone [data-app=photos]'); await A.wait_for_timeout(1200)
        n = await A.evaluate("document.querySelectorAll('#photos .ph-shot').length")
        ok(n >= 3, f'the phone Photos app lists them ({n})')
        await A.screenshot(path='/tmp/shots/cam_photos.png')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        ok(await A.evaluate("document.getElementById('photos').classList.contains('hidden')"), 'Esc closes Photos')
        await A.evaluate("__cc.photocam.setOn(false)"); await A.wait_for_timeout(500)
        ok(await A.evaluate("!__cc.weapons.holstered && (!__cc.weapons.model || __cc.weapons.model.visible)"), 'putting it away brings the gun back')
        print('errors:', errs); ok(not errs, 'no page errors')
        await b.close()
    print('FAILURES:', fails)
asyncio.run(main())
