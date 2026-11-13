# CITY BANK + jobs in the browser (PC): the bank building, the teller menu (deposit), the JOBS kiosk, a delivery job
# with the marker + top line, and the vault heist (hold E to drill, door swings open, grab a stack, get away).
# Needs the server started with CC_TEST=1 (teleport hook).
import asyncio, os, math
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)

async def tp(P, x, y, z, yaw=0, cash=None, pitch=0):
    c = f", cash: {cash}" if cash else ''
    await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{x}, {y}, {z}], yaw: {yaw}{c} }})")
    for i in range(40):
        await P.wait_for_timeout(250)
        f = await P.evaluate("[__cc.walker.feet.x, __cc.walker.feet.z]")
        if math.hypot(f[0] - x, f[1] - z) < 1.2: break
    await P.evaluate(f"__cc.G.yaw = {yaw}; __cc.G.pitch = {pitch}"); await P.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(1500)
        await P.click('[data-action=desktop]'); await P.wait_for_timeout(1500)
        B = await P.evaluate('__cc.map.bank'); jb = await P.evaluate('__cc.map.jobBoard')
        # outside the bank
        await tp(P, B['center'][0] + 14, 0.15, B['center'][2] - 2, yaw=math.pi / 2 + 0.15, pitch=0.12)
        await P.screenshot(path='/tmp/shots/b1_bank_outside.png')
        # teller: deposit
        tel = await P.evaluate("__cc.map.shops.find(s => s.name === 'CITY BANK').keeper")
        await tp(P, tel[0], 0.15, tel[2] + 3.0, yaw=0, cash=900)
        print('teller prompt:', await P.evaluate('__cc.G.prompt'))
        await P.keyboard.press('KeyE'); await P.wait_for_timeout(700)
        print('bank menu:', (await P.inner_text('#shopmenu')).replace('\n', ' | ')[:240])
        await P.click('#shopmenu [data-buy=dep500]'); await P.wait_for_timeout(900)
        print('after deposit: cash', await P.evaluate('__cc.G.players.get(__cc.G.room.you).cash'), '| savings', await P.evaluate('__cc.G.bank'), '|', await P.inner_text('#shopmenu .sm-msg:last-child'))
        await P.screenshot(path='/tmp/shots/b2_teller.png')
        await P.keyboard.press('Escape'); await P.wait_for_timeout(400)
        # jobs kiosk -> delivery
        await tp(P, jb[0], 0.15, jb[2] + 0.6, yaw=0)
        print('kiosk prompt:', await P.evaluate('__cc.G.prompt'))
        await P.keyboard.press('KeyE'); await P.wait_for_timeout(700)
        print('jobs menu:', (await P.inner_text('#shopmenu')).replace('\n', ' | ')[:240])
        await P.screenshot(path='/tmp/shots/b3_jobs.png')
        await P.click('#shopmenu [data-buy=delivery]'); await P.wait_for_timeout(1200)
        print('job line:', await P.inner_text('#jobline'), '| marker', await P.evaluate('__cc.marker.root.visible'))
        await P.screenshot(path='/tmp/shots/b4_job_marker.png')
        tg = await P.evaluate('__cc.G.job.target')
        await tp(P, tg[0], tg[1], tg[2]); await P.wait_for_timeout(1200)
        print('after pickup:', await P.inner_text('#jobline'))
        tg = await P.evaluate('__cc.G.job.target')
        await tp(P, tg[0] + 6, tg[1], tg[2] + 6, yaw=math.atan2(-(-6), -(-6)))
        await P.screenshot(path='/tmp/shots/b5_drop_marker.png')
        await tp(P, tg[0], tg[1], tg[2]); await P.wait_for_timeout(1200)
        print('delivered:', (await P.inner_text('#levelup')).replace('\n', ' | '), '| job', await P.evaluate('__cc.G.job'))
        # the vault (no NPC police for this part of the test)
        await P.evaluate("__cc.net.send({ type: 'testNoCops' })")
        await tp(P, B['drill'][0], 0.15, B['drill'][2] - 0.2, yaw=math.pi)   # facing +Z (the vault door)
        print('vault prompt:', await P.evaluate('__cc.G.prompt'))
        await P.screenshot(path='/tmp/shots/b6_vault_closed.png')
        await P.keyboard.down('KeyE')
        for i in range(90):
            await P.wait_for_timeout(1000)
            if await P.evaluate("__cc.bankView.state === 'open'"): break
            if i % 10 == 0: print('  drilling', await P.evaluate('__cc.G.rob && __cc.G.rob.p'), '| stars', await P.evaluate('__cc.G.players.get(__cc.G.room.you).wanted'))
        await P.keyboard.up('KeyE')
        print('vault state:', await P.evaluate('__cc.bankView.state'), '| door collision off:', await P.evaluate('__cc.bankView.box.off'))
        await P.wait_for_timeout(3500)
        await P.screenshot(path='/tmp/shots/b7_vault_open.png')
        L = B['loot'][1]
        await tp(P, L[0], 0.15, L[2] - 1.2, yaw=math.pi)
        print('stack prompt:', await P.evaluate('__cc.G.prompt'))
        await P.keyboard.press('KeyE'); await P.wait_for_timeout(1200)
        print('carrying:', await P.evaluate('__cc.G.heist'), '| line:', await P.inner_text('#jobline'))
        await P.screenshot(path='/tmp/shots/b8_grabbed.png')
        await P.evaluate("window.__h = []; __cc.net.on('heist', m => __h.push(JSON.stringify(m))); __cc.net.on('kill', m => __h.push('kill ' + JSON.stringify(m)))")
        await tp(P, B['center'][0] + 125, 0.15, B['center'][2] + 0)
        for i in range(12):
            await P.wait_for_timeout(500)
            if 'HEIST' in await P.inner_text('#levelup'): break
        print('heist msgs:', await P.evaluate('__h'), '| alive', await P.evaluate('__cc.G.me.alive'))
        print('getaway:', (await P.inner_text('#levelup')).replace('\n', ' | '), '| cash', await P.evaluate('__cc.G.players.get(__cc.G.room.you).cash'))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
