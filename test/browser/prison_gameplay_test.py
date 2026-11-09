import asyncio, math
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def tp(pg, x, y, z, yaw=None):
    await pg.evaluate(f'__cc.walker.feet.set({x}, {y}, {z}); __cc.walker.vel.set(0,0,0)' + (f'; __cc.G.yaw = {yaw}; __cc.G.pitch = -0.1' if yaw is not None else '')); await pg.wait_for_timeout(700)
async def arrest_flow(b, vr=False):
    A = await b.new_page(viewport={'width':960,'height':600}); B = await b.new_page(viewport={'width':960,'height':600})
    await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
    await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(900)
    code = await A.inner_text('#lobby-code')
    await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(2500)
    await B.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()"); await B.click('[data-action=join]'); await B.wait_for_timeout(900)
    for pg in (A,B): await pg.click('[data-action=desktop]'); await pg.wait_for_timeout(400)
    await A.bring_to_front()
    for nm in await A.evaluate("__cc.map.shops.map(s => s.name)"):
        if await A.evaluate('__cc.G.me.wanted') >= 3: break
        info = await A.evaluate(f"""(() => {{ const s = __cc.map.shops.find(s => s.name === '{nm}'); for (const [id, n] of __npcMap) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 0.5) return [id, s.keeper[0], s.keeper[2], s.yaw || 0]; }})()""")
        if not info: continue
        await tp(A, info[1] - math.sin(info[3]) * 3.2, 0.3, info[2] - math.cos(info[3]) * 3.2)
        w0 = await A.evaluate('__cc.G.me.wanted')
        for i in range(20):
            await A.evaluate(f"__cc.net.send({{ type: 'rob', id: {info[0]} }})"); await A.wait_for_timeout(300)
            w = await A.evaluate('__cc.G.me.wanted')
            if w >= 3 or w >= w0 + 2: break
    print('wanted before arrest:', await A.evaluate('__cc.G.me.wanted'))
    af = await A.evaluate('[__cc.walker.feet.x, __cc.walker.feet.y, __cc.walker.feet.z]')
    await B.bring_to_front(); await B.wait_for_timeout(300)
    await tp(B, af[0] + 1.3, af[1] + 0.2, af[2] + 0.5); await B.wait_for_timeout(600)
    aid = await A.evaluate('__cc.G.room.you')
    await A.bring_to_front(); await A.wait_for_timeout(300)
    await B.evaluate(f"__cc.net.send({{ type: 'arrest', id: {aid} }})"); await A.wait_for_timeout(1500)
    return A, B
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        errs=[]
        A, B = await arrest_flow(b)
        for t,pg in (('A',A),('B',B)): pg.on('pageerror', lambda e, t=t: errs.append(t+': '+str(e)+' '+(e.stack or '')[:300]))
        print('cut active:', await A.evaluate('__cc.cut.active'))
        await A.wait_for_timeout(1500)
        await A.keyboard.press('Space'); await A.wait_for_timeout(200)
        for i in range(80):
            if not await A.evaluate('__cc.cut.active'): break
            await A.wait_for_timeout(200)
        print('skipped -> prisoner:', await A.evaluate('__cc.prison.prisoner'), 'cut still active:', await A.evaluate('__cc.cut.active'))
        await A.wait_for_timeout(800)
        P = await A.evaluate('(() => { const m = __cc.map.prison; return { cells: m.cells.map(c => [c.bed, c.front, c.yaw]) }; })()')
        cell = await A.evaluate('__cc.prison.me.cell')
        bed, front, cyaw = P['cells'][cell]
        # walk out of the cell through the open door (real collision)
        await tp(A, bed[0] + (1 if cell < 5 else -1), 0.6, bed[2] + 1.4, -cyaw)
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(2500); await A.keyboard.up('KeyW')
        f = await A.evaluate('__cc.walker.feet.toArray().map(v=>+v.toFixed(2))')
        print('walked from cell to', f, '-> out of cell:', (f[0] > -51 if cell < 5 else f[0] < -21))
        await A.screenshot(path='/tmp/shots/e01_hall.png')
        # talk to an inmate
        inm = await A.evaluate('(() => { for (const n of __cc.npcs.map.values()) if (n.type === 4) return [n.id, n.x, n.y, n.z]; })()')
        await tp(A, inm[1] + 1.6, inm[2] + 0.2, inm[3], math.atan2(1.6, 0) * -1 + math.pi / 2 * 0 + math.atan2(-(inm[1] - (inm[1] + 1.6)), -(inm[3] - inm[3])))
        await A.wait_for_timeout(300)
        print('prompt near inmate:', await A.evaluate('__cc.G.prompt'))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        print('subtitle:', (await A.inner_text('#subtitle'))[:140])
        await A.screenshot(path='/tmp/shots/e02_talk.png')
        # basketball
        await tp(A, 0, 0.3, 421.5, 0); await A.wait_for_timeout(500)
        bpos = await A.evaluate('__cc.prisonView.ball.position.toArray().map(v=>+v.toFixed(2))')
        await tp(A, bpos[0], 0.3, bpos[2] + 1.2, 0)
        print('prompt near ball:', await A.evaluate('__cc.G.prompt'))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(700)
        print('holding ball:', await A.evaluate('__cc.prison.ballHeld'), '| prompt:', await A.evaluate('__cc.G.prompt'))
        await A.screenshot(path='/tmp/shots/e03_ball.png')
        await A.mouse.click(480, 300); await A.wait_for_timeout(1500)
        print('ball after throw:', await A.evaluate('__cc.prisonView.ball.position.toArray().map(v=>+v.toFixed(2))'), 'held:', await A.evaluate('__cc.prison.ballHeld'))
        # hold-E interaction: swipe a spoon (cafeteria)
        it = await A.evaluate("__cc.map.prison.interacts.find(i => i.id === 'spoon').p")
        await tp(A, it[0], 0.3, it[2] + 1.6, 0); await A.evaluate('__cc.G.pitch = -0.45'); await A.wait_for_timeout(400)
        print('prompt at spoon:', await A.evaluate('__cc.G.prompt'))
        await A.keyboard.down('KeyE'); await A.wait_for_timeout(900)
        await A.screenshot(path='/tmp/shots/e04_hold.png')
        print('progress bar:', await A.evaluate('!document.getElementById("robbar").classList.contains("hidden")'), (await A.inner_text('#robtext')))
        await A.wait_for_timeout(1500); await A.keyboard.up('KeyE'); await A.wait_for_timeout(700)
        print('items:', await A.evaluate('__cc.prison.me.items'), '| caught?', await A.evaluate('__cc.prison.me && __cc.walker.feet.z < 430 && __cc.walker.feet.x < -40'))
        # restricted area -> guard / camera
        await tp(A, 0, 0.3, 386, 0); await A.wait_for_timeout(500)
        await A.screenshot(path='/tmp/shots/e05_admin.png')
        caught = False
        for i in range(30):
            await A.wait_for_timeout(500)
            fz = await A.evaluate('__cc.walker.feet.x')
            if fz < -45 or fz > -20 and fz < -16: caught = True; break
            if await A.evaluate('__cc.walker.feet.x') < -50 or await A.evaluate('Math.abs(__cc.walker.feet.z - 386) > 5'): caught = True; break
        print('caught in admin building:', caught, '| alarm:', await A.evaluate('__cc.prison.st.alarm'), '| feet', await A.evaluate('__cc.walker.feet.toArray().map(v=>+v.toFixed(1))'))
        # tour screenshots
        tour = [('f01_yard', 0, 0.3, 444, 0), ('f02_cafeteria', 18, 0.3, 412, -math.pi/2), ('f03_laundry', 18, 0.3, 427, -math.pi*0.75), ('f04_sallyport', 18, 0.3, 360, math.pi/2), ('f05_tunnel', 23, -4.4, 445, math.pi), ('f06_sewer', -45, -5.9, 437, -math.pi/2), ('f07_tower_view', -56, 9.4, 449, math.pi), ('f08_cellblock', -36, 0.3, 427, 0)]
        for name, x, y, z, yaw in tour:
            await tp(A, x, y, z, yaw); await A.evaluate('__cc.G.pitch = -0.15'); await A.wait_for_timeout(600)
            await A.screenshot(path=f'/tmp/shots/{name}.png')
        print('B sees prisoner avatar:', await B.evaluate('[...__cc.remote.players.values()].map(p => [p.info.name, p.info.jail])'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
