let ws = null;
let myId = null;
let myRoomId = null;
let gameState = null;

function joinGame() {
  const name = document.getElementById('input-name').value.trim() || '匿名玩家';
  const room = document.getElementById('input-room').value.trim() || 'default';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'join', name, roomId: room }));
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose   = () => showToast('与服务器断开连接');
  ws.onerror   = () => showToast('连接失败，请检查网络');
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myId = msg.playerId; myRoomId = msg.roomId;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('game-screen').style.display = 'flex';
      document.getElementById('room-info').textContent = `房间：${myRoomId}`;
      break;
    case 'room_state':
      gameState = msg; renderState(msg); break;
    case 'game_start':
      showToast('游戏开始！'); break;
    case 'round_end':
      showToast(`${msg.winnerName} 赢得本局，获得 ${msg.pot} 筹码！`); break;
    case 'compare_result': {
      const who = msg.result > 0 ? msg.player1 : msg.player2;
      showToast(`[${msg.mode}] ${who} 胜出`); break;
    }
    case 'chat':
      appendChat(msg.message,
        (msg.message.includes('加入') || msg.message.includes('离开')) ? 'system' : 'action');
      break;
    case 'error': showToast(msg.message); break;
  }
}

function renderState(state) {
  document.getElementById('pot-display').textContent = `底池：${state.pot}`;
  const me = state.players.find(p => p.id === myId);
  if (me) document.getElementById('my-chips').textContent = `筹码：${me.chips}`;
  // 同步 showCards 勾选框
  const chkShow = document.getElementById('chk-show-cards');
  if (me && chkShow.checked !== !!me.showCards) chkShow.checked = !!me.showCards;
  const isMyTurn = me && state.players[state.currentTurn]?.id === myId;
  const inGame = state.phase === 'betting';

  // 其他玩家
  const area = document.getElementById('players-area');
  area.innerHTML = '';
  for (const p of state.players) {
    if (p.id === myId) continue;
    const isActive = state.players[state.currentTurn]?.id === p.id;
    const div = document.createElement('div');
    div.className = `player-card${isActive ? ' active' : ''}${p.folded ? ' folded' : ''}`;
    const cardsHtml = buildOtherCardsHtml(p);
    div.innerHTML = `
      <div class="player-name">${escHtml(p.name)}</div>
      <div class="player-chips">筹码：${p.chips}</div>
      <div class="player-bet">本局：${p.bet}</div>
      <div class="player-status">${statusText(p, state.phase)}</div>
      <div class="cards-row">${cardsHtml}</div>
    `;
    area.appendChild(div);
  }

  // 自己手牌
  const myCardsEl = document.getElementById('my-cards');
  myCardsEl.innerHTML = '';
  if (me?.cards?.length === 3) {
    for (const c of me.cards) myCardsEl.appendChild(buildCard(c));
    document.getElementById('hand-type').textContent = ` (${getHandName(me.cards)})`;
  } else if (inGame) {
    for (let i = 0; i < 3; i++) myCardsEl.appendChild(buildBackCard());
    document.getElementById('hand-type').textContent = '';
  } else {
    document.getElementById('hand-type').textContent = '';
  }

  // 按钮状态
  document.getElementById('btn-ready').disabled   = state.phase !== 'waiting' || !!me?.isReady;
  document.getElementById('btn-look').disabled    = !inGame || !!me?.looked || !!me?.folded;
  document.getElementById('btn-bet').disabled     = !inGame || !isMyTurn || !!me?.folded;
  for (const el of document.querySelectorAll('.quick-bet')) el.disabled = !inGame || !isMyTurn || !!me?.folded;
  document.getElementById('btn-fold').disabled    = !inGame || !isMyTurn || !!me?.folded;
  // 比牌：轮到自己、未弃牌、且至少跟过一轮注
  document.getElementById('btn-compare').disabled = !inGame || !isMyTurn || !!me?.folded || !me?.hasBet;
  const compareHint = document.getElementById('compare-hint');
  if (inGame && isMyTurn && !me?.folded && !me?.hasBet) {
    compareHint.textContent = '（需先下注一轮才能比牌）';
  } else {
    compareHint.textContent = '';
  }

  // 比牌对象：所有未弃牌的其他玩家
  const sel = document.getElementById('compare-select');
  const prevVal = sel.value;
  sel.innerHTML = '';
  for (const p of state.players) {
    if (p.id === myId || p.folded) continue;
    const opt = document.createElement('option');
    opt.value = p.id;
    const tag = p.looked ? '(已看)' : '(未看)';
    opt.textContent = `${p.name} ${tag}`;
    if (p.id === prevVal) opt.selected = true;
    sel.appendChild(opt);
  }

  // 下注提示
  if (me && inGame) {
    const mult = me.looked ? 2 : 1;
    const minBet = state.currentBet * mult;
    const cur = parseInt(document.getElementById('bet-input').value) || 0;
    document.getElementById('bet-input').min   = minBet;
    document.getElementById('bet-input').value = Math.max(cur, minBet);
    document.getElementById('bet-hint').textContent =
      me.looked ? `最低 ${minBet}（已看牌，底注×2）` : `最低 ${minBet}（未看牌，底注×1）`;
  } else {
    document.getElementById('bet-hint').textContent = '';
  }
}

function statusText(p, phase) {
  if (p.folded) return '已弃牌';
  if (phase === 'waiting') return p.isReady ? '✓ 已准备' : '等待中';
  return p.looked ? '已看牌' : '未看牌';
}

function buildOtherCardsHtml(p) {
  if (p.cards && p.cards.length === 3) {
    return p.cards.map(c => buildCard(c).outerHTML).join('');
  }
  if (p.folded) return '';
  return [0,1,2].map(() => buildBackCard().outerHTML).join('');
}

/* ══════════════════════════════════════════════════════
   扑克牌绘制
   grid 3列×4行，每格用 [col, row] 定位（1-indexed）
   pip(s, col, row, flip?) 放一个花色点
══════════════════════════════════════════════════════ */

// 每个点数对应的花色点位置 [col(1-3), row(1-4), flip?]
// 列：1=左 2=中 3=右；行：1=上 2=中上 3=中下 4=下
const PIP_LAYOUTS = {
  'A':  [[2,2]],
  '2':  [[2,1],[2,4,true]],
  '3':  [[2,1],[2,2],[2,4,true]],
  '4':  [[1,1],[3,1],[1,4,true],[3,4,true]],
  '5':  [[1,1],[3,1],[2,2],[1,4,true],[3,4,true]],
  '6':  [[1,1],[3,1],[1,3,true],[3,3,true],[1,4,true],[3,4,true]],
  '7':  [[1,1],[3,1],[1,3,true],[3,3,true],[2,2],[1,4,true],[3,4,true]],
  '8':  [[1,1],[3,1],[1,3,true],[3,3,true],[2,2],[2,3,true],[1,4,true],[3,4,true]],
  '9':  [[1,1],[3,1],[1,2],[3,2],[2,2],[1,3,true],[3,3,true],[1,4,true],[3,4,true]],
  '10': [[1,1],[3,1],[1,2],[3,2],[2,2],[2,3,true],[1,3,true],[3,3,true],[1,4,true],[3,4,true]],
  'J':  null,
  'Q':  null,
  'K':  null,
};

// 人头牌符号
const FACE_SYMBOLS = { 'J': 'J', 'Q': 'Q', 'K': 'K' };

function buildCard(c) {
  const isRed = c.suit === '♥' || c.suit === '♦';
  const el = document.createElement('div');
  el.className = `card ${isRed ? 'red' : 'black'}`;

  // 角标
  el.innerHTML = `
    <div class="tl"><span>${c.rank}</span><span>${c.suit}</span></div>
    <div class="br"><span>${c.rank}</span><span>${c.suit}</span></div>
  `;

  const layout = PIP_LAYOUTS[c.rank];
  if (layout === null) {
    // 人头牌：中央大字母
    const face = document.createElement('div');
    face.className = 'face-center';
    face.textContent = FACE_SYMBOLS[c.rank];
    el.appendChild(face);
  } else {
    // 数字牌：花色点阵
    const pips = document.createElement('div');
    pips.className = 'pips';

    // 填满 3×4 grid，只在指定位置放花色点，其余放空占位
    const cells = {};
    for (const [col, row, flip] of layout) {
      cells[`${col},${row}`] = flip ? true : false;
    }

    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 3; col++) {
        const key = `${col},${row}`;
        const span = document.createElement('span');
        if (cells.hasOwnProperty(key)) {
          span.className = 'p' + (cells[key] ? ' flip' : '');
          // A 用大号花色
          span.textContent = c.suit;
          if (c.rank === 'A') span.style.fontSize = '1.4em';
        }
        pips.appendChild(span);
      }
    }
    el.appendChild(pips);
  }

  return el;
}

function buildBackCard() {
  const el = document.createElement('div');
  el.className = 'card back';
  return el;
}

/* ══════════════════════════════════════════════════════
   牌型判断
══════════════════════════════════════════════════════ */
const RANK_VALUE = { 'A':14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };

function getHandName(cards) {
  if (!cards || cards.length < 3) return '?';
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const sorted = [...values].sort((a, b) => a - b);
  const isStr = (sorted[2] - sorted[0] === 2 && new Set(sorted).size === 3) || sorted.join(',') === '2,3,14';
  if (isFlush && isStr) return '同花顺';
  if (values[0] === values[1] && values[1] === values[2]) return '豹子';
  if (isStr) return '顺子';
  if (isFlush) return '同花';
  if (values[0] === values[1] || values[1] === values[2]) return '对子';
  return '散牌';
}

/* ══════════════════════════════════════════════════════
   操作
══════════════════════════════════════════════════════ */
function sendReady()   { ws.send(JSON.stringify({ type: 'ready' })); }
function sendLook()    { ws.send(JSON.stringify({ type: 'look' })); }
function sendFold()    { ws.send(JSON.stringify({ type: 'fold' })); }

function quickBet(amount) {
  document.getElementById('bet-input').value = amount;
  sendBet();
}

function sendBet() {
  const amount = parseInt(document.getElementById('bet-input').value) || 0;
  ws.send(JSON.stringify({ type: 'bet', amount }));
}

function sendCompare() {
  const targetId = document.getElementById('compare-select').value;
  if (!targetId) { showToast('没有可比牌的对象'); return; }
  ws.send(JSON.stringify({ type: 'compare', targetId }));
}

function sendShowCards(enabled) {
  ws.send(JSON.stringify({ type: 'showCards', enabled }));
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  ws.send(JSON.stringify({ type: 'chat', message: msg }));
  input.value = '';
}

function appendChat(text, cls = '') {
  const log = document.getElementById('chat-log');
  const div = document.createElement('div');
  if (cls) div.className = `msg-${cls}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
