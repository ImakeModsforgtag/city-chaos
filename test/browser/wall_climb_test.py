# PC wall climbing: walk into a building wall and hold Space -> scale it and pull up onto the roof.
# Also: no climbing in prison, and the mod menu can give the Golden Sniper.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.removeItem('cc_mods'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)

# a plain solid building wall facing an open street: stand 0.5 m from its middle, facing it
FIND = """(() => { const W = __cc.world;
  for (const b of __cc.map.buildings) {
    if (b.kind !== 'solid' || b.h < 7 || b.h > 16 || (b.y0 || 0) > 0.2) continue;
    const cx = (b.x0 + b.x1) / 2, z = b.z1 + 0.55;   // south face
    const dn = W.raycast(cx, 1.6, z, 0, -1, 0, 3); if (!(dn > 1.3 && dn < 1.8)) continue;
    const toWall = W.raycast(cx, 1.0, z, 0, 0, -1, 2); if (!(toWall < 0.7)) continue;
    if (W.raycast(cx, 1.0, z, 0, 0, 1, 4) < 4) continue;
    const roof = W.raycast(cx, b.h + 3, b.z1 - 1.5, 0, -1, 0, 6);
    return { x: cx, y: 1.6 - dn, z, h: b.h, roofY: b.h + 3 - roof, yaw: 0 };
  } return null; })()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await b.new_page(viewport={'width': 1000, 'height': 600}); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.click('[data-action=desktop]'); await P.wait_for_timeout(1500)
        spot = await P.evaluate(FIND)
        print('wall:', spot)
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{spot['x']}, {spot['y']} + 0.05, {spot['z']}], yaw: 0 }})"); await P.wait_for_timeout(2500)
        await P.evaluate("__cc.G.yaw = 0; __cc.G.pitch = 0.5")
        y0 = await P.evaluate('__cc.walker.feet.y')
        # walk into the wall without Space: you stay on the ground
        await P.keyboard.down('KeyW'); await P.wait_for_timeout(1500)
        print('walking into the wall (no Space): feet y', round(await P.evaluate('__cc.walker.feet.y'), 2), 'from', round(y0, 2))
        # hold Space too: climb
        await P.keyboard.down('Space'); await P.wait_for_timeout(1200)
        mid = await P.evaluate('[__cc.walker.feet.y, __cc.walker.climbing]')
        print('climbing after 1.2 s: feet y', round(mid[0], 2), '| climbing flag', mid[1])
        await P.screenshot(path='/tmp/shots/c1_climbing.png')
        for i in range(90):
            await P.wait_for_timeout(500)
            st = await P.evaluate('[__cc.walker.feet.y, __cc.walker.feet.z, __cc.walker.grounded]')
            if st[0] > spot['roofY'] - 0.3 and st[2]: break
        await P.keyboard.up('Space'); await P.wait_for_timeout(600); await P.keyboard.up('KeyW')
        st = await P.evaluate('[__cc.walker.feet.y, __cc.walker.feet.z, __cc.walker.grounded]')
        print(f"on the roof? feet y {st[0]:.2f} (roof {spot['roofY']:.2f}), z {st[1]:.2f} (wall at {spot['z'] - 0.55:.2f}), grounded {st[2]}")
        await P.evaluate("__cc.G.pitch = -0.4"); await P.wait_for_timeout(800)
        await P.screenshot(path='/tmp/shots/c2_roof.png')
        # let go mid-climb -> fall back down
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{spot['x']}, {spot['y']} + 0.05, {spot['z']}], yaw: 0 }})"); await P.wait_for_timeout(2500)
        await P.evaluate("__cc.G.yaw = 0")
        await P.keyboard.down('KeyW'); await P.keyboard.down('Space'); await P.wait_for_timeout(900)
        up = await P.evaluate('__cc.walker.feet.y')
        await P.keyboard.up('Space'); await P.wait_for_timeout(4000); await P.keyboard.up('KeyW')
        print('let go of Space at', round(up, 2), '-> fell back to', round(await P.evaluate('__cc.walker.feet.y'), 2))
        # mod menu: give the Golden Sniper
        await P.keyboard.type('MODMENU', delay=120); await P.wait_for_timeout(900)
        print('mod panel open:', await P.evaluate("!document.getElementById('modmenu').classList.contains('hidden')"))
        has = await P.evaluate("!!document.querySelector('#modmenu [data-a=\"give:golden\"]')")
        print('mod menu has a Golden Sniper give button:', has, await P.evaluate("document.querySelector('#modmenu [data-a=\"give:golden\"]')?.textContent"))
        await P.evaluate("document.querySelector('#modmenu [data-a=\"give:golden\"]').click()"); await P.wait_for_timeout(1200)
        print('holding:', await P.evaluate('__cc.weapons.current.w'), '| owner info:', await P.evaluate('JSON.stringify(__cc.G.gold)'))
        await P.screenshot(path='/tmp/shots/c3_mod_golden.png')
        await P.keyboard.press('F8'); await P.wait_for_timeout(500)
        await P.evaluate("__cc.desk.mouse.right = true"); await P.wait_for_timeout(1500)
        print('golden scope works: scoped', await P.evaluate('__cc.G.scoped'), 'fov', await P.evaluate('__cc.camera.fov'))
        await P.screenshot(path='/tmp/shots/c4_mod_golden_scope.png')
        await P.evaluate("__cc.desk.mouse.right = false")
        print('errors:', errs)
        await b.close()
asyncio.run(main())
