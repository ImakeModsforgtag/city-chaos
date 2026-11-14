# City map + living pedestrians in the browser: the PC minimap, the big map (M) with a click-to-drop GPS pin,
# the phone MAP app, peds dancing back when you dance, and umbrellas in the rain. Needs CC_TEST=1 on :3000.
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
        A = await (await b.new_context(viewport={'width': 1100, 'height': 700})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [28, 0.15, 2], yaw: 0.6 }); __cc.net.send({ type: 'testClock', hour: 12, weather: null })"); await A.wait_for_timeout(2500)
        vis = await A.evaluate("getComputedStyle(document.getElementById('minimap')).display !== 'none'")
        ok(vis, 'the minimap shows while playing')
        px = await A.evaluate("(() => { const d = document.getElementById('minimap').getContext('2d').getImageData(170, 170, 1, 1).data; return [...d]; })()")
        ok(px[3] > 0, f'the minimap has something drawn in the middle {px}')
        await A.screenshot(path='/tmp/shots/map_minimap.png')
        # big map
        await A.keyboard.press('KeyM'); await A.wait_for_timeout(600)
        if not await A.evaluate("__cc.bigMap.isOpen()"): await A.evaluate("__cc.bigMap.open()"); await A.wait_for_timeout(400)
        ok(await A.evaluate("__cc.bigMap.isOpen()"), 'M opens the big city map')
        ok(await A.evaluate("__cc.G.view") == 'playing', 'opening the map does not pause the game')
        box = await A.evaluate("(() => { const r = document.querySelector('#citymap canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        # click the spot for world (-60, 40)
        sx = box[0] + (( -60 / 126) * 0.5 + 0.5) * box[2]; sy = box[1] + ((40 / 126) * 0.5 + 0.5) * box[3]
        await A.mouse.click(sx, sy); await A.wait_for_timeout(600)
        gps = await A.evaluate("JSON.stringify(__cc.G.gps)")
        print('   gps:', gps)
        import json; g = json.loads(gps) if gps else None
        ok(bool(g) and 'MAP PIN' in g['label'] and abs(g['p'][0] + 60) < 3 and abs(g['p'][2] - 40) < 3, 'clicking the map drops a GPS pin there')
        await A.wait_for_timeout(800)
        await A.screenshot(path='/tmp/shots/map_big.png')
        # click a place: the race start
        sx = box[0] + ((56 / 126) * 0.5 + 0.5) * box[2]; sy = box[1] + ((-30 / 126) * 0.5 + 0.5) * box[3]
        await A.mouse.click(sx, sy); await A.wait_for_timeout(500)
        ok('RACE' in (await A.evaluate("__cc.G.gps && __cc.G.gps.label") or ''), 'clicking near a place sets the GPS to that place')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(400)
        ok(not await A.evaluate("__cc.bigMap.isOpen()"), 'Esc closes the map')
        # phone MAP app
        await A.evaluate("__cc.phone.open()"); await A.wait_for_timeout(400)
        await A.click('#phone [data-app=map]'); await A.wait_for_timeout(500)
        ok(await A.evaluate("__cc.bigMap.isOpen() && !__cc.phone.isOpen()"), 'the phone MAP app opens the big map')
        await A.evaluate("__cc.bigMap.close()")
        # VR wrist phone map page draws
        await A.evaluate("__cc.phone.mapMode = true; __cc.phone.key = ''; __cc.phone.drawVR()")
        ok(await A.evaluate("__cc.phone.buttons.length === 1 && __cc.phone.buttons[0].app === 'back'"), 'the VR phone has a MAP page with a BACK button')
        import base64
        data = await A.evaluate("__cc.phone.c.toDataURL('image/png')")
        open('/tmp/shots/map_vrphone.png', 'wb').write(base64.b64decode(data.split(',')[1]))
        await A.evaluate("__cc.phone.tap('back'); __cc.phone.drawVR()")
        ok(await A.evaluate("!__cc.phone.mapMode && __cc.phone.buttons.some(b => b.app === 'map')"), 'BACK returns to the apps (with a MAP button)')
        # peds dance back: stand next to one and dance
        ped = await A.evaluate("(() => { const n = [...__cc.npcs.map.values()].find(n => n.type === 0 && n.alive && n.root.visible); return n ? [n.x, n.y, n.z] : null; })()")
        if not ped:
            ped = await A.evaluate("(() => { const n = [...__cc.npcs.map.values()].find(n => n.type === 0 && n.alive); return n ? [n.x, n.y, n.z] : null; })()")
        ok(ped is not None, 'found a pedestrian')
        if ped:
            danced = False
            for tries in range(4):
                ped = await A.evaluate("(() => { const n = [...__cc.npcs.map.values()].find(n => n.type === 0 && n.alive && n.state === 0); return n ? [n.x, n.y, n.z] : null; })()")
                await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{ped[0] + 1.5}, {ped[1]}, {ped[2]}], yaw: 1.57 }})"); await A.wait_for_timeout(700)
                await A.evaluate("__cc.net.send({ type: 'emote', e: 2 })"); await A.wait_for_timeout(1500)
                if 7 in await A.evaluate("[...__cc.npcs.map.values()].filter(n => n.type === 0).map(n => n.state)"): break
                await A.wait_for_timeout(800)
            st = await A.evaluate("[...__cc.npcs.map.values()].filter(n => n.type === 0).map(n => n.state)")
            ok(7 in st, f'a pedestrian dances back (states {sorted(set(st))})')
            await A.screenshot(path='/tmp/shots/ped_dance.png')
            await A.evaluate("__cc.net.send({ type: 'testClock', hour: 13, weather: 'rain' })"); await A.wait_for_timeout(800)
            await A.evaluate("__cc.weather.w = 0.7"); await A.wait_for_timeout(4500)
            umb = await A.evaluate("[...__cc.npcs.map.values()].filter(n => n.umb && n.umb.visible).length")
            ok(umb > 0, f'pedestrians open umbrellas in the rain ({umb})')
            await A.screenshot(path='/tmp/shots/ped_umbrella.png')
        print('errors:', errs)
        ok(not errs, 'no page errors')
        await b.close()
    print('FAILURES:', fails)
asyncio.run(main())
