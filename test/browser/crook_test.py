# NPC bad guys in the browser: a robber walks into the GUN SHOP, holds up the clerk, runs off with a cash bag;
# a car thief steals a car; a cop player arrests a robber with E. Needs the server started with CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.removeItem('cc_mods'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
CROOK = "(() => { const c = [...__cc.npcs.map.values()].filter(n => n.type === 6); return c.map(n => ({ id: n.id, x: +n.x.toFixed(1), z: +n.z.toFixed(1), st: n.state, vis: n.root.visible, bag: n.bag && n.bag.visible, car: !!(n.flags & 32) })); })()"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await b.new_page(viewport={'width': 1000, 'height': 600}); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.click('[data-action=desktop]'); await P.wait_for_timeout(1500)
        await P.evaluate("window.__feed = []; for (const t of ['crook', 'robAlert', 'npcSay']) __cc.net.on(t, m => __feed.push(t + ':' + (m.ev || m.text || m.shop)))")
        # stand across the street from the GUN SHOP, looking at its door
        g = await P.evaluate("(() => { const C = __cc.map.shops.find(s => s.name === 'GUN SHOP'); return C.keeper; })()")
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{g[0]} + 4, 0.15, {g[2]} - 14], yaw: Math.PI - 0.25 }})"); await P.wait_for_timeout(2500)
        await P.evaluate("__cc.G.yaw = Math.PI - 0.25; __cc.G.pitch = -0.05")
        await P.evaluate("__cc.net.send({ type: 'testCrook', job: 'rob', shop: 'GUN SHOP' })"); await P.wait_for_timeout(2500)
        print('robber appears:', await P.evaluate(CROOK))
        await P.screenshot(path='/tmp/shots/k1_robber_arrives.png')
        for i in range(30):
            await P.wait_for_timeout(1000)
            if 'crook:rob' in await P.evaluate('__feed.join(",")'): break
        await P.wait_for_timeout(1500)
        print('holding up the clerk:', await P.evaluate(CROOK), '| feed:', await P.evaluate("document.getElementById('feed') ? document.getElementById('feed').innerText.split('\\n').slice(-2).join(' | ') : ''"))
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{g[0]}, 0.15, {g[2]} + 5.6], yaw: 0 }})"); await P.wait_for_timeout(2500)
        await P.evaluate("__cc.G.yaw = 0; __cc.G.pitch = -0.1")
        await P.screenshot(path='/tmp/shots/k2_holdup.png')
        for i in range(30):
            await P.wait_for_timeout(1000)
            if 'crook:robbed' in await P.evaluate('__feed.join(",")'): break
        await P.wait_for_timeout(2500)
        print('running off with the cash:', await P.evaluate(CROOK))
        await P.screenshot(path='/tmp/shots/k3_flee.png')
        # be a cop and arrest the next one
        await P.evaluate("__cc.net.send({ type: 'setRole', role: 'cop' })"); await P.wait_for_timeout(2500)
        await P.evaluate("window.__nrob = __feed.filter(f => f === 'crook:rob').length; __cc.net.send({ type: 'testCrook', job: 'rob', shop: 'SNAX', noCops: 1 })"); await P.wait_for_timeout(1500)
        for i in range(30):
            await P.wait_for_timeout(1000)
            if await P.evaluate("__feed.filter(f => f === 'crook:rob').length > window.__nrob"): break
        await P.wait_for_timeout(1500)
        s = await P.evaluate("(() => { const c = [...__cc.npcs.map.values()].filter(n => n.type === 6).pop(); return [c.x, c.y, c.z]; })()")
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{s[0]} + 1.3, {s[1]}, {s[2]}], yaw: Math.PI / 2 }})"); await P.wait_for_timeout(2500)
        await P.evaluate("__cc.G.yaw = Math.PI / 2")
        print('cop prompt next to a robber:', await P.evaluate('__cc.G.prompt'))
        await P.screenshot(path='/tmp/shots/k4_cop_arrest.png')
        await P.keyboard.press('KeyE'); await P.wait_for_timeout(1500)
        print('after E: feed', await P.evaluate('__feed.slice(-3).join(",")'), '| cash', await P.evaluate('__cc.G.players.get(__cc.G.room.you).cash'))
        # car thief
        await P.evaluate("__cc.net.send({ type: 'setRole', role: 'civilian' })"); await P.wait_for_timeout(2000)
        await P.evaluate("window.__tc = null; __cc.net.on('testCrook', m => window.__tc = m); __cc.net.send({ type: 'testCrook', job: 'car' })"); await P.wait_for_timeout(1500)
        tc = await P.evaluate('window.__tc')
        print('car thief:', tc)
        if tc and tc['id']:
            c = await P.evaluate(f"(() => {{ const c = __cc.cars.get({tc['car']}); return [c.x, c.z, c.yaw]; }})()")
            await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{c[0]} + 9, 0.15, {c[1]} + 9], yaw: 0 }})"); await P.wait_for_timeout(2000)
            await P.evaluate(f"(() => {{ const f = __cc.walker.feet, c = __cc.cars.get({tc['car']}); __cc.G.yaw = Math.atan2(-(c.x - f.x), -(c.z - f.z)); __cc.G.pitch = -0.15; }})()")
            await P.screenshot(path='/tmp/shots/k5_thief_walks.png')
            for i in range(25):
                await P.wait_for_timeout(1000)
                if 'crook:car' in await P.evaluate('__feed.join(",")'): break
            await P.wait_for_timeout(600)
            await P.evaluate(f"(() => {{ const f = __cc.walker.feet, c = __cc.cars.get({tc['car']}); __cc.G.yaw = Math.atan2(-(c.x - f.x), -(c.z - f.z)); }})()")
            print('stolen:', await P.evaluate(f"(() => {{ const c = __cc.cars.get({tc['car']}); return {{ crookDriver: !!c.crook, speed: c.speed }}; }})()"), await P.evaluate(CROOK))
            await P.screenshot(path='/tmp/shots/k6_stolen.png')
        print('feed log:', await P.evaluate('__feed.join(" | ")'))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
