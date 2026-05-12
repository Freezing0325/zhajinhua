const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUE = { 'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

const rooms = new Map();

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, value: RANK_VALUE[rank] });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandRank(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const sorted = [...values].sort((a, b) => a - b);
  // A-2-3 是最小顺子
  const isStr = (sorted[2] - sorted[0] === 2 && new Set(sorted).size === 3) ||
    (sorted.join(',') === '2,3,14');

  if (values[0] === values[1] && values[1] === values[2]) return { rank: 5, name: '豹子', values };
  if (isFlush && isStr) return { rank: 4, name: '同花顺', values };
  if (isStr) return { rank: 3, name: '顺子', values };
  if (isFlush) return { rank: 2, name: '同花', values };
  if (values[0] === values[1] || values[1] === values[2]) return { rank: 1, name: '对子', values };
  return { rank: 0, name: '散牌', values };
}

function compareHands(a, b) {
  const ha = getHandRank(a);
  const hb = getHandRank(b);
  if (ha.rank !== hb.rank) return ha.rank > hb.rank ? 1 : -1;
  for (let i = 0; i < ha.values.length; i++) {
    if (ha.values[i] !== hb.values[i]) return ha.values[i] > hb.values[i] ? 1 : -1;
  }
  return 0; // 平局
}

function broadcast(room, msg) {
  for (const p of room.players) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
}

function cardsVisibleTo(room, player, viewerId) {
  const isShowdown = room.phase === 'showdown';

  // 自己的牌：游戏中需看牌后才可见，showdown 时始终可见
  if (player.id === viewerId) {
    if (isShowdown) return true;
    return player.looked;
  }

  // 公开手牌：仅 showdown 时生效
  if (isShowdown && player.showCards) return true;

  const viewer = room.players.find(p => p.id === viewerId);

  // showdown：未弃牌玩家的牌对其它未弃牌玩家可见（弃牌者看不到别人牌）
  if (isShowdown && !player.folded && viewer && !viewer.folded) return true;

  return false;
}

function getRoomState(room, forPlayerId) {
  return {
    type: 'room_state',
    roomId: room.id,
    phase: room.phase,
    pot: room.pot,
    currentBet: room.currentBet,
    currentTurn: room.currentTurn,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      looked: p.looked,
      isReady: p.isReady,
      showCards: p.showCards,
      hasBet: p.hasBet,
      cards: cardsVisibleTo(room, p, forPlayerId) ? p.cards : null,
    })),
  };
}

function sendState(room) {
  for (const p of room.players) {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(getRoomState(room, p.id)));
    }
  }
}

function nextTurn(room) {
  const active = room.players.filter(p => !p.folded);
  if (active.length === 1) {
    endRound(room, active[0]);
    return;
  }
  let idx = (room.currentTurn + 1) % room.players.length;
  // 防止越界（有玩家离开时）
  if (idx >= room.players.length) idx = 0;
  while (room.players[idx].folded) {
    idx = (idx + 1) % room.players.length;
  }
  room.currentTurn = idx;
  sendState(room);
}

function removeBrokePlayers(room) {
  const before = room.players.length;
  room.players = room.players.filter(p => {
    if (p.chips <= 0) {
      broadcast(room, { type: 'chat', message: `${p.name} 筹码耗尽，离开房间` });
      try { p.ws.close(); } catch (_) {}
      return false;
    }
    return true;
  });
  // 修正 currentTurn 越界
  if (room.currentTurn >= room.players.length) room.currentTurn = 0;
  if (room.nextStarterIdx >= room.players.length) room.nextStarterIdx = 0;
  return before - room.players.length;
}

function endRound(room, winner) {
  room.phase = 'showdown';
  winner.chips += room.pot;
  // 记录下一局起始玩家：上一个失败者优先，否则顺延
  if (room.lastEliminated != null) {
    room.nextStarterIdx = room.lastEliminated;
  } else {
    room.nextStarterIdx = (room.currentTurn + 1) % room.players.length;
  }
  broadcast(room, { type: 'round_end', winnerId: winner.id, winnerName: winner.name, pot: room.pot });
  sendState(room);
  setTimeout(() => {
    room.phase = 'waiting';
    room.lastEliminated = null;
    for (const p of room.players) {
      p.isReady = false;
      p.cards = [];
      p.bet = 0;
      p.folded = false;
      p.looked = false;
      p.hasBet = false;
      p.comparedWith = [];
    }
    // 淘汰筹码耗尽玩家
    removeBrokePlayers(room);
    if (room.players.length < 2) {
      broadcast(room, { type: 'chat', message: '游戏结束，玩家不足。请等待新玩家加入。' });
      room.phase = 'waiting';
    }
    sendState(room);
  }, 4000);
}

function startGame(room) {
  const deck = shuffle(createDeck());
  room.phase = 'betting';
  room.pot = 0;
  // currentBet 以"不看牌单位"计，看牌者下注时乘2
  room.currentBet = room.ante;
  // 下一局起始玩家：上局失败者先行动
  if (room.nextStarterIdx >= room.players.length) room.nextStarterIdx = 0;
  room.currentTurn = room.nextStarterIdx;

  for (const p of room.players) {
    p.cards = [deck.pop(), deck.pop(), deck.pop()];
    p.bet = room.ante;
    p.folded = false;
    p.looked = false;
    p.hasBet = false;
    p.chips -= room.ante;
    room.pot += room.ante;
  }

  sendState(room);
  broadcast(room, { type: 'game_start' });
}

wss.on('connection', (ws) => {
  let playerId = null;
  let roomId = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'join') {
      playerId = Math.random().toString(36).slice(2, 8);
      roomId = msg.roomId || 'default';

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId, phase: 'waiting', players: [],
          pot: 0, currentBet: 0, currentTurn: 0, ante: 10,
          nextStarterIdx: 0,
        });
      }

      const room = rooms.get(roomId);
      if (room.players.length >= 6) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已满（最多6人）' }));
        return;
      }

      const player = {
        id: playerId, name: msg.name || `玩家${playerId}`,
        chips: 1000, bet: 0, folded: false, looked: false,
        isReady: false, cards: [], ws,
        comparedWith: [], showCards: false,
      };
      room.players.push(player);
      ws.send(JSON.stringify({ type: 'joined', playerId, roomId }));
      sendState(room);
      broadcast(room, { type: 'chat', message: `${player.name} 加入了房间` });
    }

    if (!playerId || !roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    if (msg.type === 'ready') {
      if (room.phase !== 'waiting') return;
      player.isReady = true;
      sendState(room);
      const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
      if (allReady) {
        // 开局前淘汰筹码为0的玩家
        if (room.players.some(p => p.chips <= 0)) {
          removeBrokePlayers(room);
          if (room.players.length < 2) {
            broadcast(room, { type: 'chat', message: '玩家不足，无法开始游戏。' });
            sendState(room);
            return;
          }
        }
        startGame(room);
      }
    }

    if (msg.type === 'look') {
      if (room.phase !== 'betting' || player.looked || player.folded) return;
      player.looked = true;
      // 只给自己发更新后的状态（含牌面）
      sendState(room);
    }

    if (msg.type === 'fold') {
      if (room.phase !== 'betting' || room.players[room.currentTurn].id !== playerId) return;
      player.folded = true;
      room.lastEliminated = room.players.indexOf(player);
      broadcast(room, { type: 'chat', message: `${player.name} 弃牌` });
      nextTurn(room);
    }

    if (msg.type === 'bet') {
      if (room.phase !== 'betting' || room.players[room.currentTurn].id !== playerId) return;
      // 看牌者最低下注是当前底注的2倍，不看牌者是1倍
      const minBet = room.currentBet * (player.looked ? 2 : 1);
      const amount = Math.max(minBet, msg.amount || minBet);
      if (player.chips < amount) {
        ws.send(JSON.stringify({ type: 'error', message: '筹码不足' }));
        return;
      }
      player.chips -= amount;
      player.bet += amount;
      player.hasBet = true;
      room.pot += amount;
      // currentBet 统一换算为"不看牌单位"后再比较
      const normalizedAmount = player.looked ? amount / 2 : amount;
      if (normalizedAmount > room.currentBet) room.currentBet = normalizedAmount;
      broadcast(room, { type: 'chat', message: `${player.name} 下注 ${amount}` });
      nextTurn(room);
    }

    if (msg.type === 'compare') {
      if (room.phase !== 'betting' || room.players[room.currentTurn].id !== playerId) return;
      if (!player.hasBet) {
        ws.send(JSON.stringify({ type: 'error', message: '必须先跟注一轮才能比牌' }));
        return;
      }
      const target = room.players.find(p => p.id === msg.targetId && !p.folded);
      if (!target) {
        ws.send(JSON.stringify({ type: 'error', message: '目标玩家不存在或已弃牌' }));
        return;
      }
      const cost = room.currentBet * (player.looked ? 2 : 1);
      const allIn = player.chips < cost;
      const actualPay = allIn ? Math.max(0, player.chips) : cost;
      player.chips -= cost;
      room.pot += actualPay;

      const isMeng = !player.looked;
      const targetMeng = !target.looked;
      const modeStr = (isMeng && targetMeng ? '蒙蒙比' : isMeng ? '蒙看比' : '看看比') + (allIn ? '(ALL-IN)' : '');

      player.comparedWith.push(target.id);
      target.comparedWith.push(player.id);

      const result = compareHands(player.cards, target.cards);

      // 比牌卡牌可见性规则：仅发送玩家自己的牌（已看牌时），对手牌绝不泄露。
      // compare_cards 必须先于 compare_result 发送，确保前端收到动画触发时已缓存好牌面数据。
      function sendCompareCards(to) {
        to.ws.send(JSON.stringify({
          type: 'compare_cards',
          myCards: to.looked ? to.cards : null,
        }));
      }
      sendCompareCards(player);
      sendCompareCards(target);

      // compare_result 不含卡牌，仅携带比牌双方 ID 和胜负结果
      broadcast(room, {
        type: 'compare_result',
        player1: player.name, player1Id: player.id,
        player2: target.name, player2Id: target.id,
        result, mode: modeStr,
      });

      if (result > 0) {
        target.folded = true;
        room.lastEliminated = room.players.indexOf(target);
        broadcast(room, { type: 'chat', message: `[${modeStr}] ${player.name} 胜，${target.name} 出局` });
        nextTurn(room);
      } else {
        player.folded = true;
        room.lastEliminated = room.players.indexOf(player);
        broadcast(room, { type: 'chat', message: `[${modeStr}] ${target.name} 胜，${player.name} 出局` });
        nextTurn(room);
      }
    }

    if (msg.type === 'showCards') {
      player.showCards = !!msg.enabled;
      sendState(room);
    }

    if (msg.type === 'chat') {
      const text = String(msg.message || '').slice(0, 100);
      if (text) broadcast(room, { type: 'chat', message: `${player.name}: ${text}` });
    }
  });

  ws.on('close', () => {
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    const name = room.players[idx].name;
    room.players.splice(idx, 1);
    broadcast(room, { type: 'chat', message: `${name} 离开了房间` });
    if (room.players.length === 0) {
      rooms.delete(roomId);
      return;
    }
    // 修正 currentTurn 越界
    if (room.currentTurn >= room.players.length) room.currentTurn = 0;
    // 如果游戏进行中，检查是否只剩一人
    if (room.phase === 'betting') {
      const active = room.players.filter(p => !p.folded);
      if (active.length === 1) {
        endRound(room, active[0]);
        return;
      }
      // 如果轮到已弃牌的位置，跳到下一个
      if (room.players[room.currentTurn]?.folded) nextTurn(room);
      else sendState(room);
    } else {
      sendState(room);
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`炸金花服务器运行在 http://localhost:${PORT}`);
});
