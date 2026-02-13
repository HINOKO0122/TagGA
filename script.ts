// --- 定数と型定義 ---
const ROOM_SIZE = 200;
const SIM_COUNT = 25;
const DURATION = 10; // 秒
const FPS = 30;
const WARP_COOLDOWN = 60; // フレーム数

interface Entity {
    x: number; y: number; angle: number;
    warpCooldown: number; alive: boolean;
    dna: number[]; score: number;
}

// --- ニューラルネットワーク (簡易版) ---
// 入力: [自分x, 自分y, 相手x, 相手y, 角度差, ワープ可否, 残り時間]
// 出力: [回転, 移動/停止, ワープ実行]
function predict(input: number[], dna: number[]): { angle: number, move: boolean, warp: boolean } {
    let output = [0, 0, 0];
    // DNAを重みとして簡易計算
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < input.length; j++) {
            output[i] += input[j] * dna[i * input.length + j];
        }
    }
    return {
        angle: output[0],
        move: output[1] > 0,
        warp: output[2] > 0.5
    };
}

// --- ゲームロジック ---
class Simulation {
    ctx: CanvasRenderingContext2D;
    chaser: Entity;
    evader: Entity;
    timer: number = DURATION * FPS;
    isPlayerMode: boolean = false;
    playerRole: 'chaser' | 'evader' | null = null;

    constructor(canvas: HTMLCanvasElement, chaserDNA: number[], evaderDNA: number[]) {
        this.ctx = canvas.getContext('2d')!;
        this.chaser = this.initEntity(0, 0, chaserDNA);
        this.evader = this.initEntity(ROOM_SIZE, ROOM_SIZE, evaderDNA);
    }

    initEntity(x: number, y: number, dna: number[]): Entity {
        return { x, y, angle: 0, warpCooldown: 0, alive: true, dna, score: 0 };
    }

    update(keys: Set<string>) {
        if (!this.chaser.alive || this.timer <= 0) return;

        [this.chaser, this.evader].forEach((ent, idx) => {
            const isChaser = idx === 0;
            const target = isChaser ? this.evader : this.chaser;
            
            let moveCmd = { angle: 0, move: true, warp: false };

            if (this.isPlayerMode && this.playerRole === (isChaser ? 'chaser' : 'evader')) {
                // プレイヤー操作
                if (keys.has('a')) ent.angle -= 0.2;
                if (keys.has('d')) ent.angle += 0.2;
                moveCmd.move = keys.has('w');
                moveCmd.warp = keys.has(' ');
            } else {
                // AI操作
                const inputs = [ent.x/200, ent.y/200, target.x/200, target.y/200, ent.angle, ent.warpCooldown === 0 ? 1 : 0, this.timer/300];
                moveCmd = predict(inputs, ent.dna);
                ent.angle += moveCmd.angle * 0.2;
            }

            if (moveCmd.move) {
                ent.x += Math.cos(ent.angle) * 3;
                ent.y += Math.sin(ent.angle) * 3;
            }

            if (moveCmd.warp && ent.warpCooldown === 0) {
                ent.x += Math.cos(ent.angle) * 40;
                ent.y += Math.sin(ent.angle) * 40;
                ent.warpCooldown = WARP_COOLDOWN;
            }

            // 境界チェック
            ent.x = Math.max(0, Math.min(ROOM_SIZE, ent.x));
            ent.y = Math.max(0, Math.min(ROOM_SIZE, ent.y));
            if (ent.warpCooldown > 0) ent.warpCooldown--;
        });

        // 判定
        const dist = Math.hypot(this.chaser.x - this.evader.x, this.chaser.y - this.evader.y);
        if (dist < 10) {
            this.chaser.alive = false; // 捕獲
            this.chaser.score = 1000 + this.timer; // 早く捕まえるほど高得点
            this.evader.score = (DURATION * FPS) - this.timer; // 耐えた時間がスコア
        }

        this.timer--;
        if (this.timer <= 0 && this.chaser.alive) {
            // タイムアップ時のスコア
            this.chaser.score = Math.max(0, 500 - dist);
            this.evader.score = 1000 + dist;
        }
        this.draw();
    }

    draw() {
        const c = this.ctx;
        c.clearRect(0, 0, ROOM_SIZE, ROOM_SIZE);
        // 鬼 (赤)
        c.fillStyle = 'red';
        c.fillRect(this.chaser.x - 5, this.chaser.y - 5, 10, 10);
        // 逃走者 (青)
        c.fillStyle = 'cyan';
        c.fillRect(this.evader.x - 5, this.evader.y - 5, 10, 10);
    }
}

// --- 進化・管理ロジック (抜粋) ---
// 1. 25個のインスタンスを作成
// 2. 10秒経過後、上位のDNAを交叉・突然変異させて次世代へ
// 3. インポート/エクスポートは JSON.stringify(bestDNA) で実装
