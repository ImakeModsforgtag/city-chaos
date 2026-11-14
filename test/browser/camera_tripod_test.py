# 📷 the camera tablet and its 🔺 tripod (PC): the button bar, front/back camera, mirror and upside down really
# changing the saved picture, standing it on the tripod, looking through it, aiming it, capturing from it, stepping
# away and picking it back up. Needs CC_TEST=1 on :3000.
import asyncio, os
from playwright.async_api import async_playwright
from PIL import Image, ImageChops, ImageStat
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
fails = 0
def ok(c, m):
    global fails
    print(('  PASS ' if c else '  FAIL ') + m)
    if not c: fails += 1

async def shoot(A, dls, path):
    """take one photo and save it"""
    n = len(dls)
    await A.evaluate("__cc.photocam.photo()")
    for _ in range(40):
        if len(dls) > n: break
        await A.wait_for_timeout(1000)
    if len(dls) == n: return None
    await dls[-1].save_as(path)
    return Image.open(path).convert('RGB')

def closer(ref, same, flipped):
    """is `flipped` the better match for ref than `same`?"""
    d1 = ImageStat.Stat(ImageChops.difference(ref, same)).mean[0]
    d2 = ImageStat.Stat(ImageChops.difference(ref, flipped)).mean[0]
    return d2, d1

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 1100, 'height': 700}, accept_downloads=True)
        A = await ctx.new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        dls = []; A.on('download', lambda d: dls.append(d))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        # a clear noon street with something asymmetric to look at
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [28, 0.15, 2], yaw: 0.6 }); __cc.net.send({ type: 'testClock', hour: 12, weather: 'clear' })")
        await A.wait_for_timeout(2500)

        # ---- the tablet and its button bar
        await A.keyboard.press('KeyV'); await A.wait_for_timeout(1500)
        ok(await A.evaluate("__cc.photocam.on"), 'V takes out the tablet')
        n = await A.evaluate("document.querySelectorAll('#camui button').length")
        ok(n == 8, f'the button bar has all 8 buttons ({n})')
        labels = await A.evaluate("[...document.querySelectorAll('#camui button b')].map(b => b.textContent)")
        print('   buttons:', labels)
        ok('BACK CAM' in labels and 'TRIPOD' in labels and 'MIRROR' in labels and 'UPSIDE DOWN' in labels, 'photo, video, camera, tripod, mirror and flip buttons are there')
        ok(await A.evaluate("__cc.photocam.bar.material.map.image.width > 0 && __cc.photocam.barRects.length === 8"), 'the tablet in your hand draws the same 8 buttons')
        await A.screenshot(path='/tmp/shots/cam_tablet.png')

        # ---- clicking a button on the bar (Esc frees the mouse, without pausing the game)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        ok(await A.evaluate("__cc.G.view") == 'playing', 'Esc frees the mouse without pausing the game')
        await A.click('#camui [data-a=face]'); await A.wait_for_timeout(600)
        ok(await A.evaluate("__cc.photocam.front"), 'clicking 🔄 switches to the front camera')
        await A.click('#camui [data-a=face]'); await A.wait_for_timeout(600)
        ok(not await A.evaluate("__cc.photocam.front"), 'and back to the back camera')
        await A.click('#camui [data-a=tripod]'); await A.wait_for_timeout(900)
        ok(await A.evaluate("__cc.photocam.onTripod"), 'clicking 🔺 TRIPOD stands it up')
        await A.click('#camui [data-a=tripod]'); await A.wait_for_timeout(700)
        ok(not await A.evaluate("__cc.photocam.onTripod"), 'clicking ✋ PICK UP takes it back')
        await A.click('#camui [data-a=video]'); await A.wait_for_timeout(1500)
        ok(await A.evaluate("__cc.photocam.recording"), 'clicking 🎥 starts recording')
        await A.click('#camui [data-a=video]')
        for _ in range(20):
            if dls: break
            await A.wait_for_timeout(1000)
        ok(any(d.suggested_filename.endswith(('.mp4', '.webm')) for d in dls), 'clicking ⏹ stops and saves it')
        await A.evaluate("__cc.desk.lock()"); await A.wait_for_timeout(400)

        # ---- mirror and upside down really change the saved picture
        base = await shoot(A, dls, '/tmp/shots/flip_base.jpg')
        ok(base is not None, 'a plain photo saved')
        await A.keyboard.press('KeyH'); await A.wait_for_timeout(500)
        ok(await A.evaluate("__cc.photocam.flipH"), 'H turns on the mirror')
        mir = await shoot(A, dls, '/tmp/shots/flip_h.jpg')
        if base and mir:
            d_flip, d_same = closer(base, mir, mir.transpose(Image.FLIP_LEFT_RIGHT))
            ok(d_flip < d_same * 0.5, f'the mirrored photo really is flipped left to right (diff {d_flip:.1f} vs {d_same:.1f})')
        await A.keyboard.press('KeyH'); await A.keyboard.press('KeyJ'); await A.wait_for_timeout(500)
        ok(await A.evaluate("!__cc.photocam.flipH && __cc.photocam.flipV"), 'J turns on upside down (and H turns the mirror off)')
        upd = await shoot(A, dls, '/tmp/shots/flip_v.jpg')
        if base and upd:
            d_flip, d_same = closer(base, upd, upd.transpose(Image.FLIP_TOP_BOTTOM))
            ok(d_flip < d_same * 0.5, f'the upside down photo really is flipped top to bottom (diff {d_flip:.1f} vs {d_same:.1f})')
        await A.keyboard.press('KeyJ'); await A.wait_for_timeout(400)
        ok(await A.evaluate("!__cc.photocam.flipV"), 'J turns it back the right way up')

        # ---- zoom
        await A.keyboard.press('KeyZ'); await A.wait_for_timeout(400)
        ok(await A.evaluate("__cc.photocam.zoom === 1 && __cc.photocam.lensCam.fov < 62"), 'Z zooms in')
        await A.keyboard.press('KeyZ'); await A.keyboard.press('KeyZ'); await A.wait_for_timeout(400)
        ok(await A.evaluate("__cc.photocam.zoom === 0"), 'Z cycles back to 1x')

        # ---- 🔺 tripod
        me = await A.evaluate("(() => { const v = __cc.camera.getWorldPosition(new __cc.photocam.tripod.position.constructor()); return [v.x, v.y, v.z]; })()")
        await A.keyboard.press('KeyT'); await A.wait_for_timeout(1200)
        ok(await A.evaluate("__cc.photocam.onTripod && __cc.photocam.tripod.visible"), 'T stands the camera on its tripod')
        tp = await A.evaluate("(() => { const t = __cc.photocam.tripod.position; return [t.x, t.y, t.z]; })()")
        d = ((tp[0] - me[0]) ** 2 + (tp[2] - me[2]) ** 2) ** 0.5
        ok(1.0 < d < 3.5, f'it stands a step or two in front of you ({d:.1f}m)')
        ok(abs(tp[1] - (me[1] - 1.6)) < 1.2, f'and on the ground, not floating ({tp[1]:.2f} vs feet {me[1] - 1.6:.2f})')
        ok(await A.evaluate("__cc.photocam.lensCam.parent === __cc.photocam.tPitch"), 'the lens moved onto the tripod')
        ok(await A.evaluate("__cc.photocam.povOn"), 'you are looking through it straight away')
        ok(await A.evaluate("!__cc.weapons.deskHolder.visible"), 'your own hands stay out of the picture')
        ok(await A.evaluate("__cc.selfieAvatar ? __cc.selfieAvatar.root.visible : true"), 'you can see yourself standing there')
        await A.wait_for_timeout(1500)
        await A.screenshot(path='/tmp/shots/cam_tripod_pov.png')
        ok(await A.evaluate("document.querySelector('#camui').classList.contains('pov')"), 'the photo frame guide shows')
        labels = await A.evaluate("[...document.querySelectorAll('#camui button b')].map(b => b.textContent)")
        ok('PICK UP' in labels and 'STEP AWAY' in labels, f'the buttons change to the tripod ones ({labels})')

        # ---- aiming it
        y0 = await A.evaluate("__cc.photocam.yaw")
        await A.evaluate("__cc.desk.mouse.dx = 300; __cc.desk.mouse.dy = -60"); await A.wait_for_timeout(400)
        y1 = await A.evaluate("__cc.photocam.yaw")
        ok(abs(y1 - y0) > 0.1, f'the mouse aims the tripod camera ({y0:.2f} -> {y1:.2f})')
        ok(abs(await A.evaluate("__cc.G.yaw") - (await A.evaluate("__cc.G.yaw"))) < 1e-9 and await A.evaluate("__cc.photocam.pitch") > 0, 'and tilts it up')
        before = await A.evaluate("JSON.stringify([__cc.walker.feet.x, __cc.walker.feet.z])")
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(900); await A.keyboard.up('KeyW')
        ok(await A.evaluate("JSON.stringify([__cc.walker.feet.x, __cc.walker.feet.z])") == before, 'you stay put while looking through it')

        # ---- capture from the tripod
        shot = await shoot(A, dls, '/tmp/shots/cam_tripod_shot.jpg')
        ok(shot is not None and 40 < ImageStat.Stat(shot.convert('L')).mean[0] < 230, 'the capture button saves what the tripod sees')

        # ---- step away, come back, pick it up
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(600)
        ok(not await A.evaluate("__cc.photocam.povOn") and await A.evaluate("__cc.photocam.onTripod"), 'E steps away, the tripod stays')
        ok(await A.evaluate("__cc.weapons.deskHolder.visible"), 'the tablet is back in your hands')
        ok(await A.evaluate("__cc.photocam.screen.material.map === __cc.photocam.viewRT.texture"), 'the tablet still shows what the tripod sees')
        await A.screenshot(path='/tmp/shots/cam_tripod_world.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(600)
        ok(await A.evaluate("__cc.photocam.povOn"), 'E looks through it again')
        await A.keyboard.press('KeyT'); await A.wait_for_timeout(800)
        ok(not await A.evaluate("__cc.photocam.onTripod || __cc.photocam.povOn || __cc.photocam.tripod.visible"), 'T picks the tripod back up')
        ok(await A.evaluate("__cc.photocam.lensCam.parent === __cc.photocam.model"), 'the lens is back on the tablet')
        await A.keyboard.press('KeyV'); await A.wait_for_timeout(600)
        ok(not await A.evaluate("__cc.photocam.on") and await A.evaluate("document.getElementById('camui').classList.contains('hidden')"), 'V puts the tablet away and hides the bar')
        print('errors:', errs); ok(not errs, 'no page errors')
        await b.close()
    print('FAILURES:', fails)
asyncio.run(main())
