import asyncio, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
LAND = "new Promise(res => { const t0 = performance.now(); const iv = setInterval(() => { if (__cc.walker.grounded || performance.now() - t0 > 6000) { clearInterval(iv); setTimeout(res, 300); } }, 100); })"
async def tp(pg, x, y, z):
    await pg.evaluate(f'__cc.walker.feet.set({x}, {y}, {z}); __cc.walker.vel.set(0,0,0)'); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        errs=[]
        A = await b.new_page(viewport={'width':960,'height':600}); B = await b.new_page(viewport={'width':960,'height':600})
        for t,pg in (('A',A),('B',B)): pg.on('pageerror', lambda e, t=t: errs.append(t+': '+str(e)+' '+(e.stack or '')[:300]))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(3000)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1000)
        code = await A.inner_text('#lobby-code')
        await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(3000)
        await B.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()"); await B.click('[data-action=join]'); await B.wait_for_timeout(1000)
        for pg in (A,B): await pg.click('[data-action=desktop]'); await pg.wait_for_timeout(500)
        await A.bring_to_front()
        # A robs the gun shop (2 stars) and steals a police car (+2)
        info = await A.evaluate("""(() => { const s = __cc.map.shops.find(s => s.name === 'GUN SHOP'); for (const [id, n] of __npcMap) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 0.5) return [id, s.keeper[0], s.keeper[2]]; })()""")
        await tp(A, info[1], 0.2, info[2] + 3.2)
        for i in range(25):
            await A.evaluate(f"__cc.net.send({{ type: 'rob', id: {info[0]} }})"); await A.wait_for_timeout(300)
            if await A.evaluate('__cc.G.me.wanted') >= 2: break
        names = await A.evaluate("__cc.map.shops.map(s => s.name)")
        for nm in names:
            if await A.evaluate('__cc.G.me.wanted') >= 3: break
            if nm == 'GUN SHOP': continue
            info2 = await A.evaluate(f"""(() => {{ const s = __cc.map.shops.find(s => s.name === '{nm}'); for (const [id, n] of __npcMap) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 0.5) return [id, s.keeper[0], s.keeper[2], s.yaw || 0]; }})()""")
            if not info2: continue
            await tp(A, info2[1] - __import__('math').sin(info2[3]) * 3.2, 0.3, info2[2] - __import__('math').cos(info2[3]) * 3.2)
            for i in range(20):
                await A.evaluate(f"__cc.net.send({{ type: 'rob', id: {info2[0]} }})"); await A.wait_for_timeout(300)
                if await A.evaluate('__cc.G.me.wanted') >= 3: break
        await A.screenshot(path='/tmp/shots/q1_wanted.png')
        print('A wanted:', await A.evaluate('__cc.G.me.wanted'), '| top HUD:', (await A.inner_text('#wanted')).replace('\n',' '))
        af = await A.evaluate('[__cc.walker.feet.x, __cc.walker.feet.y, __cc.walker.feet.z]')
        # B (cop) arrests A
        await B.bring_to_front(); await B.wait_for_timeout(300)
        await tp(B, af[0] + 1.3, af[1] + 0.2, af[2] + 0.5)
        await B.evaluate(f"(() => {{ __cc.G.yaw = Math.atan2(-({af[0]} - __cc.walker.feet.x), -({af[2]} - __cc.walker.feet.z)); }})()"); await B.wait_for_timeout(600)
        print('B prompt:', await B.evaluate('__cc.G.prompt'))
        await A.evaluate("window.__log=[]; for (const t of ['arrestCut','joined','jailStart','arrested','tp','close','open']) __cc.net.on(t, m => __log.push(t + '@' + (performance.now()/1000).toFixed(1)))")
        A.on('console', lambda m: print('A console:', m.text) if 'net' in m.text or 'rror' in m.text else None)
        aid = await A.evaluate('__cc.G.room.you')
        await A.bring_to_front(); await A.wait_for_timeout(300)
        await B.evaluate(f"__cc.net.send({{ type: 'arrest', id: {aid} }})"); await A.wait_for_timeout(800)
        print('A cutscene active:', await A.evaluate('__cc.cut.active'), await A.evaluate('JSON.stringify(__log)'), await A.evaluate('__cc.cut.t'))
        shots = [(1.5,'c01_capture_start'), (3.6,'c02_cops_arrive'), (4.6,'c03_cuffed'), (6.8,'c04_escort'), (10,'c05_backseat'), (15,'c06_sidewindow'), (19.5,'c07_roadside'), (24,'c08_chase'), (28,'c09_prison_gate'), (30.6,'c10_sallyport'), (32.8,'c11_escort_out'), (35,'c12_corridor'), (38,'c13_6hours'), (40.4,'c14_wake'), (43.2,'c15_sent')]
        t0 = await A.evaluate('__cc.cut.t')
        for at, name in shots:
            while True:
                ct = await A.evaluate('__cc.cut.active ? __cc.cut.t : 99')
                if ct >= at: break
                await A.wait_for_timeout(120)
            await A.screenshot(path=f'/tmp/shots/{name}.png')
        for i in range(60):
            if not await A.evaluate('__cc.cut.active'): break
            await A.wait_for_timeout(200)
        await A.wait_for_timeout(1200)
        print('cut done:', not await A.evaluate('__cc.cut.active'), '| prisoner:', await A.evaluate('__cc.prison.prisoner'), '| prison view:', await A.evaluate('__cc.prisonView.active'))
        print('A feet:', await A.evaluate('__cc.walker.feet.toArray().map(v=>+v.toFixed(2))'), 'cell', await A.evaluate('__cc.prison.me && __cc.prison.me.cell'))
        print('panel:', (await A.inner_text('#prisonpanel')).replace('\n',' | ')[:200])
        await A.screenshot(path='/tmp/shots/d01_in_cell.png')
        print('B sees A jail flag:', await B.evaluate('[...__cc.G.players.values()].map(p=>[p.name,p.jail])'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
