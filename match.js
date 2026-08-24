import { PlayerCalibration } from './player-calibration.js';

export class Match {
  constructor(shotsPerPlayer = 5) {
    this.shotsPerPlayer = shotsPerPlayer;
    this.configure(1, 25);
  }

  configure(count, distance, firstPlayerPhoneHand = null) {
    this.distance = distance;
    this.players = Array.from({ length: count }, (_, index) => ({
      name: `P${index + 1}`,
      score: 0,
      shots: [],
      combo: 0,
      bestCombo: 0,
      calibration: new PlayerCalibration()
    }));
    if (firstPlayerPhoneHand) this.players[0].calibration.setPhoneHand(firstPlayerPhoneHand);
    this.currentIndex = 0;
    this.totalShots = 0;
    this.finished = false;
  }

  get current() {
    return this.players[this.currentIndex];
  }

  shotsRemaining(player = this.current) {
    return this.shotsPerPlayer - player.shots.length;
  }

  record(points) {
    const player = this.current;
    player.shots.push(points);
    player.score += points;
    if (points >= 8) {
      player.combo += 1;
      player.bestCombo = Math.max(player.bestCombo, player.combo);
    } else {
      player.combo = 0;
    }
    this.totalShots += 1;
  }

  isComplete() {
    return this.players.every(player => player.shots.length >= this.shotsPerPlayer);
  }

  advance() {
    if (this.isComplete()) {
      this.finished = true;
      return false;
    }
    for (let offset = 1; offset <= this.players.length; offset += 1) {
      const index = (this.currentIndex + offset) % this.players.length;
      if (this.players[index].shots.length < this.shotsPerPlayer) {
        this.currentIndex = index;
        return true;
      }
    }
    return false;
  }

  ranking() {
    return [...this.players].sort((a, b) => b.score - a.score || Math.max(...b.shots, 0) - Math.max(...a.shots, 0));
  }
}
