import asyncio
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
src=open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'two_player_desktop_test.py')).read(); WALK=src.split('WALK = """')[1].split('"""')[0]
LAND = "new Promise(res => { const t0 = performance.now(); const iv = setInterval(() => { if (__cc.walker.grounded || performance.now() - t0 > 8000) { clearInterval(iv); setTimeout(res, 300); } }, 100); })"
async def go(pg, x, z):
    await pg.bring_to_front()
    await asyncio.wait_for(pg.evaluate(f'__walkTo({x}, {z})'), 30)
    await asyncio.wait_for(pg.evaluate(LAND), 15)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        errs=[]
        A = await b.new_page(viewport={'width':900,'height':560}); B = await b.new_page(viewport={'width':900,'height':560})
        for t,pg in (('A',A),('B',B)): pg.on('pageerror', lambda e, t=t: errs.append(t+': '+str(e)+' '+(e.stack or '')[:300]))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('#screen-main .role-seg button[data-val=cop]'); await A.wait_for_timeout(200)
        await A.screenshot(path='/tmp/shots/r1_main_cop.png')
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1000)
        code = await A.inner_text('#lobby-code')
        await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(2500)
        await B.click('[data-action=join]'); await B.wait_for_timeout(1200)
        print('lobby:', (await A.inner_text('#lobby-players')).replace('\n',' | '))
        print('A role on server:', await A.evaluate('__cc.G.players.get(__cc.G.room.you).role'), ' B role:', await B.evaluate('__cc.G.players.get(__cc.G.room.you).role'))
        await A.screenshot(path='/tmp/shots/r2_lobby.png')
        for pg in (A,B): await pg.evaluate(WALK); await pg.click('[data-action=desktop]'); await pg.wait_for_timeout(400)
        print('A spawn feet:', await A.evaluate('[__cc.walker.feet.x.toFixed(1), __cc.walker.feet.z.toFixed(1)]'))
        pcs = await A.evaluate('[...__cc.cars.map.values()].filter(c => c.police).map(c => [c.id, +c.x.toFixed(1), +c.z.toFixed(1), c.yaw])')
        print('police cars on client:', pcs)
        # look at the police lot
        await A.evaluate(f'__face({pcs[1][1]}, 1, {pcs[1][2]})'); await A.wait_for_timeout(600)
        await A.screenshot(path='/tmp/shots/r3_police_lot.png')
        # get in a police car
        c = pcs[0]
        door = await A.evaluate(f'(() => {{ const c = __cc.cars.get({c[0]}); const d = __cc.cars.doorWorld(c); return [d.x, d.z]; }})()')
        await go(A, door[0], door[1])
        print('A prompt at door:', await A.evaluate('__cc.G.prompt'))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        print('A driving:', await A.evaluate('__cc.driving.active'), 'prompt:', await A.evaluate('__cc.G.prompt'), 'wanted', await A.evaluate('__cc.G.me.wanted'))
        await A.keyboard.press('KeyL'); await A.wait_for_timeout(700)
        print('siren on (client car):', await A.evaluate(f'__cc.cars.get({c[0]}).siren'))
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(1500); await A.keyboard.up('KeyW'); await A.wait_for_timeout(300)
        await A.screenshot(path='/tmp/shots/r4_driving_siren.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        print('A out of car:', not await A.evaluate('__cc.driving.active'))
        # B robs the gun shop
        info = await B.evaluate("""(() => { const s = __cc.map.shops.find(s => s.name === 'GUN SHOP'); for (const [id, n] of __npcMap) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 0.5) return [id, s.keeper[0], s.keeper[2]]; })()""")
        await B.evaluate(f'__cc.walker.feet.set({info[1]}, 0.2, {info[2] + 3.2}); __cc.walker.vel.set(0,0,0)'); await B.wait_for_timeout(800)
        await B.evaluate("__cc.net.on('robStatus', m => window.__rs = m)")
        await B.evaluate(f'__face({info[1]}, 1.4, {info[2]})')
        await B.evaluate(f"window.__robT = setInterval(() => __cc.net.send({{ type: 'rob', id: {info[0]} }}), 250)")  # hold like a player
        for i in range(40):
            await B.wait_for_timeout(300)
            if await B.evaluate('__cc.G.me.wanted') > 0: break
        await B.evaluate('clearInterval(window.__robT)')
        print('B dead?', not await B.evaluate('__cc.G.me.alive'));print('B wanted:', await B.evaluate('__cc.G.me.wanted'), 'last robStatus', await B.evaluate('JSON.stringify(window.__rs)'), 'feet', await B.evaluate('__cc.walker.feet.toArray().map(v=>v.toFixed(2))'))
        await A.wait_for_timeout(600)
        print('A sees B stars:', await A.evaluate('(() => { for (const p of __cc.remote.players.values()) return !!p.avatar.stars; })()'))
        feed = await A.inner_text('#killfeed'); print('A feed:', feed.replace('\n',' | '))
        # A goes to B and arrests
        bf = await B.evaluate('[__cc.walker.feet.x, __cc.walker.feet.z]')
        await A.evaluate(f'__cc.walker.feet.set({bf[0]+1.3}, 0.2, {bf[1]+0.6}); __cc.walker.vel.set(0,0,0)'); await A.wait_for_timeout(900)
        await A.evaluate(f'__face({bf[0]}, 1.3, {bf[1]})'); await A.wait_for_timeout(500)
        await A.screenshot(path='/tmp/shots/r5_arrest_prompt.png')
        print('A prompt near B:', await A.evaluate('__cc.G.prompt'))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(900)
        await B.wait_for_timeout(800)
        print('B arrested (2 stars -> station holding cell):', await B.evaluate('(() => { const f = __cc.walker.feet; return __cc.map.holding.cells.some(c => Math.hypot(c[0] - f.x, c[2] - f.z) < 1.5); })()'), '| B weapons:', await B.evaluate('__cc.weapons.slots.length'))
        print('A feed:', (await A.inner_text('#killfeed')).replace('\n',' | '))
        await B.screenshot(path='/tmp/shots/r6_arrested.png')
        # donut / dispatch cops visible?
        await A.wait_for_timeout(1500)
        print('donut cops on client:', await A.evaluate('[...__npcMap.values()].filter(n => n.donut).length'), ' cops:', await A.evaluate('[...__npcMap.values()].filter(n => n.type === 2).length'))
        await B.wait_for_timeout(12500)  # wait for release from the holding cell (role changes are locked while arrested)
        # pause menu role switch for B
        await B.keyboard.press('Escape'); await B.wait_for_timeout(400)
        await B.evaluate("document.querySelector('#pause .role-seg button[data-val=cop]').click()"); await B.wait_for_timeout(1500)
        print('B role after switch:', await B.evaluate('__cc.G.players.get(__cc.G.room.you).role'), ' spawn:', await B.evaluate('[__cc.walker.feet.x.toFixed(1), __cc.walker.feet.z.toFixed(1)]'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
