<script setup>
import { ref, onMounted } from 'vue';
import dockerNames from 'docker-names';
import GameBoard from './components/GameBoard.vue';

const PLAYER_NAME_STORAGE_KEY = 'bomber-bots-player-name';
const ROOM_NAME_STORAGE_KEY = 'bomber-bots-room-name';

const playerName = ref('');
const roomName = ref('');
const inGame = ref(false);
const error = ref('');

function getDefaultRoomName() {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const h = d.getHours();
  let timeOfDay;
  if (h >= 5 && h < 12) {
    timeOfDay = 'morning';
  } else if (h >= 12 && h < 17) {
    timeOfDay = 'afternoon';
  } else if (h >= 17 && h < 22) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }
  return `${weekday}-${timeOfDay}`;
}

function titleCaseWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Surname only (second segment from `docker-names`), title case, trailing digits stripped. */
function formatScreenName(raw) {
  const withoutDigits = raw.replace(/\d+$/, '');
  const parts = withoutDigits.split('_').filter(Boolean);
  const surname = parts.length >= 2 ? parts[1] : parts[0];
  return titleCaseWord(surname || 'Player');
}

function getDefaultScreenName() {
  const raw = dockerNames.getRandomName();
  const name = formatScreenName(raw);
  return name.length <= 32 ? name : name.slice(0, 32);
}

onMounted(() => {
  try {
    const savedName = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (savedName && savedName.length <= 32) {
      playerName.value = savedName;
    } else {
      playerName.value = getDefaultScreenName();
    }
    const savedRoom = localStorage.getItem(ROOM_NAME_STORAGE_KEY);
    if (savedRoom && savedRoom.length <= 48) {
      roomName.value = savedRoom;
    } else {
      roomName.value = getDefaultRoomName();
    }
  } catch {
    roomName.value = getDefaultRoomName();
    playerName.value = getDefaultScreenName();
  }
});

function clearStorageAndReload() {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

function joinGame() {
  const name = playerName.value.trim();
  const room = roomName.value.trim();
  if (!name || !room) {
    error.value = 'Please enter your name and a room name.';
    return;
  }
  error.value = '';
  playerName.value = name;
  roomName.value = room;
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
    localStorage.setItem(ROOM_NAME_STORAGE_KEY, room);
  } catch {
    /* ignore */
  }
  inGame.value = true;
}
</script>

<template>
  <div class="app-root">
    <div v-if="!inGame" class="lobby">
      <div class="lobby-card">
        <h1 class="title">Bomber Bots</h1>
        <p class="subtitle">
          <span class="storage-reset-trigger" @dblclick="clearStorageAndReload">Enter</span> a name and room to play.
        </p>
        <form class="lobby-form" @submit.prevent="joinGame">
          <label class="field">
            <span class="label">Your name</span>
            <input
              v-model="playerName"
              type="text"
              name="player-name"
              autocomplete="nickname"
              maxlength="32"
              placeholder="Rusty"
          />
          </label>
          <label class="field">
            <span class="label">Room name</span>
            <input
              v-model="roomName"
              type="text"
              name="room-name"
              autocomplete="off"
              maxlength="48"
              placeholder="e.g. friday-night"
            />
          </label>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="submit" class="submit">Play</button>
        </form>
      </div>
    </div>
    <GameBoard
      v-else
      :player-name="playerName"
      :room-name="roomName"
    />
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
}

.lobby {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: linear-gradient(160deg, #1a2332 0%, #0d1218 100%);
  color: #e8ecf0;
}

.lobby-card {
  width: 100%;
  max-width: 22rem;
  padding: 2rem 1.75rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.subtitle {
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
  opacity: 0.75;
}


.lobby-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.85;
}

.field input {
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: #f0f4f8;
  font-size: 1rem;
}

.field input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.field input:focus {
  outline: 2px solid #5a9fd4;
  outline-offset: 1px;
  border-color: rgba(90, 159, 212, 0.5);
}

.error {
  margin: 0;
  font-size: 0.85rem;
  color: #f0a8a8;
}

.submit {
  margin-top: 0.25rem;
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  background: #3d7ab8;
  color: #fff;
}

.submit:hover {
  background: #4a8bc9;
}

.submit:focus-visible {
  outline: 2px solid #8ec4f0;
  outline-offset: 2px;
}
</style>
