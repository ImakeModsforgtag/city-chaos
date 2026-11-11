# Golden Sniper, desktop: unlock (test hook), buy at the GUN SHOP counter, scope + ESP, lock-on, bullet cam,
# and a second player who must only ever see a normal sniper kill.  Server must run with CC_TEST=1.
import asyncio, math, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
os.makedirs('/tmp/shots', exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        b2 = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        A = await b.new_page(viewport={'width': 1000, 'height': 620}); B = await b2.new_page(viewport={'width': 800, 'height': 500})
        errs = []
        for t, pg in (('A', A), ('B', B)): pg.on('pageerror', lambda e, t=t: errs.append(t + ': ' + str(e))); pg.on('console', lambda m, t=t: errs.append(t + ' console: ' + m.text[:300]) if m.type == 'error' else None)
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()")
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(800)
        code = await A.inner_text('#lobby-code')
        await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(2500)
        await B.click('[data-action=join]'); await B.wait_for_timeout(800)
        await B.click('[data-action=desktop]'); await B.wait_for_timeout(300)
        await B.evaluate("window.__feed=[]; for (const t of ['kill','npcDie','goldInfo','goldBuy','goldShot']) __cc.net.on(t, m => __feed.push(t + ':' + (m.w || '')))")
        await A.bring_to_front()
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(500)
        await A.evaluate("window.__m=[]; for (const t of ['goldInfo','goldBuy','goldShot','npcDie','kill']) __cc.net.on(t, m => __m.push(t + ':' + JSON.stringify(m).slice(0, 140)))")
        print('before unlock, prompt at counter would be:', await A.evaluate('!!__cc.G.gold'))
        await A.evaluate("__cc.net.send({ type: 'testGold' })"); await A.wait_for_timeout(600)
        print('unlock notice:', await A.evaluate("document.getElementById('notice') ? document.getElementById('notice').textContent : ''"))
        at = await A.evaluate('__cc.G.gold.at')
        # walk (teleport in small hops so the server accepts it) to the counter, facing the shopkeeper
        await A.evaluate(f"__cc.walker.feet.set({at[0]}, {at[1]} + 0.05, {at[2]} + 0.6); __cc.walker.vel.set(0,0,0); __cc.G.yaw = 0; __cc.G.pitch = -0.05")
        await A.wait_for_timeout(6500)
        print('prompt at the counter:', await A.evaluate('__cc.G.prompt'))
        await A.screenshot(path='/tmp/shots/g1_counter.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(900)
        print('inventory:', await A.evaluate("JSON.stringify(__cc.weapons.slots.map(s => s.w))"), 'holding:', await A.evaluate('__cc.weapons.current.w'))
        await A.wait_for_timeout(600)
        await A.screenshot(path='/tmp/shots/g2_golden_in_hand.png')
        # two open street spots ~30 m apart with a clear view of each other: A shoots, B is the target
        pair = await A.evaluate("""(() => { const W = __cc.world, ok = (x, z) => { const dn = W.raycast(x, 1.6, z, 0, -1, 0, 3), up = W.raycast(x, 1.6, z, 0, 1, 0, 8); return dn > 1.3 && dn < 1.7 && up >= 8; };
          for (let x = -120; x <= 120; x += 4) for (let z = -120; z <= 120; z += 4) { if (!ok(x, z)) continue;
            for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, qx = x + Math.cos(a) * 30, qz = z + Math.sin(a) * 30; if (!ok(qx, qz)) continue;
              const dx = qx - x, dz = qz - z, d = Math.hypot(dx, dz); if (W.raycast(x, 1.6, z, dx / d, 0, dz / d, d) < d) continue;
              if (Math.hypot(x - (-42), z - (-72)) > 80) continue; return [x, z, qx, qz]; } } return null; })()""")
        print('shooter / target spots:', pair)
        async def walk(pg, x0, z0, x1, z1):
            for k in range(1, 16):
                await pg.evaluate(f"__cc.walker.feet.set({x0} + ({x1} - {x0}) * {k} / 15, 0.3, {z0} + ({z1} - {z0}) * {k} / 15); __cc.walker.vel.set(0,0,0)")
                await pg.wait_for_timeout(250)
        bpos = await B.evaluate('[__cc.walker.feet.x, __cc.walker.feet.z]')
        await asyncio.gather(walk(A, at[0], at[2] + 0.6, pair[0], pair[1]), walk(B, bpos[0], bpos[1], pair[2], pair[3]))
        await A.wait_for_timeout(1500)
        bid = await B.evaluate('__cc.G.room.you')
        aim = f"""(() => {{ const cc = __cc, q = cc.remote.players.get({bid}), e = cc.camera.getWorldPosition(new cc.camera.position.constructor());
          const dx = q.head[0] - e.x, dy = q.head[1] - 0.15 - e.y, dz = q.head[2] - e.z; cc.G.yaw = Math.atan2(-dx, -dz) + 0.006; cc.G.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }})()"""
        await A.evaluate(aim); await A.evaluate("__cc.desk.mouse.right = true")
        for _ in range(4): await A.evaluate(aim); await A.wait_for_timeout(150)
        print('scoped:', await A.evaluate('__cc.G.scoped'), 'fov', await A.evaluate('__cc.camera.fov'), 'ESP markers shown:', await A.evaluate('__cc.gold.markers.filter(m => m.g.visible).length'))
        print('lock:', await A.evaluate('JSON.stringify(__cc.gold.lock)'), '| scope text:', await A.inner_text('#scopeLock'))
        await A.screenshot(path='/tmp/shots/g3_scope_esp.png')
        await A.evaluate("__cc.gold.zoom = 1"); await A.evaluate(aim); await A.wait_for_timeout(400)
        await A.screenshot(path='/tmp/shots/g4_scope_zoom2.png')
        await A.evaluate("__cc.gold.zoom = 0"); await A.evaluate(aim); await A.wait_for_timeout(200)
        await A.evaluate(aim[:-4] + "; __cc.desk.mouse.left = true; __cc.desk.mouse.leftPressed = true; })()"); await A.wait_for_timeout(60)
        await A.evaluate("__cc.desk.mouse.left = false"); await A.wait_for_timeout(120)
        await A.evaluate("__cc.gold.bc && (__cc.gold.bc.dur = 4)")   # slow the bullet way down so this slow test renderer catches it mid-flight
        await A.wait_for_timeout(1500)
        print('caption:', await A.evaluate("getComputedStyle(document.getElementById('bulletcam')).display"), '| hud hidden:', await A.evaluate("document.getElementById('hud').classList.contains('hidden')"))
        print('bullet cam active:', await A.evaluate('!!__cc.G.bcam'))
        await A.screenshot(path='/tmp/shots/g5_bullet_cam.png')
        for _ in range(40):
            if await A.evaluate('!__cc.gold.bc || __cc.gold.bc.hit'): break
            await A.wait_for_timeout(300)
        await A.wait_for_timeout(1000)
        await A.screenshot(path='/tmp/shots/g6_bullet_cam_impact.png')
        for _ in range(60):
            if await A.evaluate('!__cc.G.bcam'): break
            await A.wait_for_timeout(500)
        print('bullet cam over:', await A.evaluate('!__cc.G.bcam'), '| B alive:', await B.evaluate('__cc.G.me.alive'))
        await A.evaluate("__cc.desk.mouse.right = false")
        print('A messages:', await A.evaluate('__m'))
        await B.bring_to_front(); await B.wait_for_timeout(400)
        print('B (the victim) saw:', await B.evaluate('__feed'), '| kill feed:', await B.evaluate("document.getElementById('feed') ? document.getElementById('feed').innerText.slice(0, 200) : ''"))
        # unscoped: no ESP layer on the main camera
        await A.bring_to_front(); await A.wait_for_timeout(300)
        print('ESP layer on main camera when not scoped:', await A.evaluate('__cc.camera.layers.isEnabled(5)'), '| fov back to', await A.evaluate('__cc.camera.fov'))
        print('ERRORS:', errs)
        await b.close(); await b2.close()
asyncio.run(main())
