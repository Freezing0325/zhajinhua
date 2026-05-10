#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// ── 参数解析 ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

const LOCAL_ONLY = flag('--local');
const TUNNEL_TYPE = (() => {
  const idx = args.indexOf('--tunnel');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  if (flag('--natapp')) return 'natapp';
  return 'cloudflare';
})();

// 读取配置文件 tunnel.json
function loadTunnelConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'tunnel.json'), 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}
const tunnelConfig = loadTunnelConfig();

const AUTHTOKEN = (() => {
  const idx = args.indexOf('--authtoken');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  if (process.env.NATAPP_AUTHTOKEN) return process.env.NATAPP_AUTHTOKEN;
  if (tunnelConfig.natapp && tunnelConfig.natapp.authtoken) return tunnelConfig.natapp.authtoken;
  return '';
})();

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function waitForServer(port, retries, cb) {
  http.get(`http://127.0.0.1:${port}`, () => cb(true)).on('error', () => {
    if (retries <= 0) return cb(false);
    setTimeout(() => waitForServer(port, retries - 1, cb), 500);
  });
}

function printLocalInfo() {
  console.log('\n' + '-'.repeat(50));
  console.log('  本机调试：http://localhost:3000');
  const ips = getLocalIPs();
  if (ips.length > 0) {
    console.log('  局域网：  http://' + ips[0] + ':3000');
  }
  console.log('-'.repeat(50) + '\n');
}

function hasCommand(cmd) {
  try { execSync('where ' + cmd, { stdio: 'ignore' }); return true; } catch { return false; }
}

// ── 服务器 ──
console.log('正在启动炸金花服务器...');

const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));
server.on('exit', code => {
  if (code !== 0) { console.error('服务器异常退出'); process.exit(1); }
});

waitForServer(3000, 10, (ok) => {
  if (!ok) { console.error('服务器启动超时'); process.exit(1); }

  printLocalInfo();

  if (LOCAL_ONLY) {
    console.log('本地调试模式（--local），未启动公网隧道。\n');
    console.log('打开多个浏览器标签页即可模拟多人对战。\n');
    return;
  }

  // ── Cloudflare 隧道 ──
  if (TUNNEL_TYPE === 'cloudflare') {
    if (!hasCommand('cloudflared')) {
      console.log('未检测到 cloudflared，仅本地运行。');
      console.log('如需公网访问，请安装：winget install Cloudflare.cloudflared\n');
      console.log('或使用 natapp 隧道：node start.js --tunnel natapp --authtoken=<你的token>\n');
      return;
    }

    console.log('正在建立 Cloudflare 公网隧道...\n');

    const tunnel = spawn('cloudflared', [
      'tunnel',
      '--url', 'http://127.0.0.1:3000',
      '--edge-ip-version', '4',
      '--no-autoupdate',
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    function handleCFOutput(data) {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/);
      if (match) {
        const url = match[0];
        console.log('\n' + '='.repeat(60));
        console.log('  公网链接（发给朋友）：');
        console.log('');
        console.log('  ' + url);
        console.log('='.repeat(60) + '\n');
      }
    }

    tunnel.stdout.on('data', handleCFOutput);
    tunnel.stderr.on('data', handleCFOutput);

    tunnel.on('exit', () => {
      console.log('Cloudflare 隧道已关闭');
      server.kill();
      process.exit(0);
    });

    function cleanupCF() {
      try { tunnel.kill(); } catch (_) {}
      try { server.kill(); } catch (_) {}
    }

    process.on('SIGINT', () => {
      console.log('\n正在关闭...');
      cleanupCF();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n收到终止信号，正在关闭...');
      cleanupCF();
      process.exit(0);
    });
  }

  // ── natapp 隧道 ──
  if (TUNNEL_TYPE === 'natapp') {
    if (!AUTHTOKEN) {
      console.error('\n错误：使用 natapp 隧道需要提供 authtoken。');
      console.error('获取方式：');
      console.error('  1. 访问 https://natapp.cn 注册账号');
      console.error('  2. 购买免费隧道（Web协议，端口 3000）');
      console.error('  3. 在"我的隧道"中复制 authtoken');
      console.error('  4. 运行：node start.js --tunnel natapp --authtoken=<你的token>\n');
      server.kill();
      process.exit(1);
    }

    // natapp 客户端可以是 natapp.exe(Windows) 或 natapp(Linux/Mac)
    const natappExe = process.platform === 'win32' ? 'natapp.exe' : 'natapp';
    if (!hasCommand(natappExe)) {
      console.error(`\n未检测到 ${natappExe}，请先从 https://natapp.cn/download 下载客户端`);
      console.error(`并将 ${natappExe} 所在目录加入系统 PATH，或放到本目录下。\n`);
      server.kill();
      process.exit(1);
    }

    console.log(`正在建立 natapp 内网隧道... (authtoken: ${AUTHTOKEN.slice(0, 4)}****)\n`);

    const natapp = spawn(natappExe, [
      '-authtoken=' + AUTHTOKEN,
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let natappUrlShown = false;

    function handleNatappOutput(data) {
      const text = data.toString();
      // natapp 输出格式：Forwarding: http://xxxxx.natappfree.cc -> 127.0.0.1:3000
      const match = text.match(/Forwarding:\s+(https?:\/\/[^\s]+)/);
      if (match && !natappUrlShown) {
        natappUrlShown = true;
        const url = match[1];
        console.log('\n' + '='.repeat(60));
        console.log('  公网链接（发给朋友）：');
        console.log('');
        console.log('  ' + url);
        console.log('');
        console.log('  ⚠ 免费隧道域名会不定期更换，重启即可获取新地址');
        console.log('='.repeat(60) + '\n');
      }
      // 转发 natapp 日志（含连接状态等）
      process.stdout.write(data);
    }

    natapp.stdout.on('data', handleNatappOutput);
    natapp.stderr.on('data', handleNatappOutput);

    natapp.on('exit', (code) => {
      console.log('natapp 隧道已关闭');
      server.kill();
      process.exit(code || 0);
    });

    function cleanupNatapp() {
      try { natapp.kill(); } catch (_) {}
      try { server.kill(); } catch (_) {}
    }

    process.on('SIGINT', () => {
      console.log('\n正在关闭...');
      cleanupNatapp();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n收到终止信号，正在关闭...');
      cleanupNatapp();
      process.exit(0);
    });
  }
});
