/**
 * 鬼ごっこ GA シミュレーター
 */

// --- 設定定数 ---
const ROOM_SIZE = 200;
const SIM_COUNT = 25;
const DURATION_SEC = 10;
const FPS = 30;
const TOTAL_FRAMES = DURATION_SEC * FPS;
const DNA_LENGTH = 21; // 入力7 * 出力3

// --- クラス定義 ---
class Agent {
    x: number; y: number; angle: number;
    warpCooldown: number = 0;
    dna: number[];
    score: number = 0;
    isAlive: boolean = true;

    constructor(x: number, y: number, dna?: number[]) {
        this.x = x; this.y = y; this.angle = Math.random() * Math.PI * 2;
        this.dna = dna || Array.from({ length: DNA_LENGTH }, () => Math.random() * 2 - 1);
    }
}

class Simulation {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    chaser: Agent;
    evader: Agent;
    frame: number = 0;
    isPlayerMode: boolean = false;
    playerRole: 'chaser' | 'evader' | null = null;

    constructor(container: HTMLElement, chaserDNA?: number[], evaderDNA?: number[]) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = ROOM_SIZE;
        this.canvas.height = ROOM_SIZE;
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;
        
        this.chaser = new Agent(10, 10, chaserDNA);
        this.evader = new Agent(190, 190, evaderDNA);
    }

    update(keys: Set<string>) {
        if (!this.chaser.isAlive && this.frame < TOTAL_FRAMES) return;
        if (this.frame >= TOTAL_FRAMES) return;

        [this.chaser, this.evader].forEach((ent, idx) => {
            const isChaser = idx === 0;
            const target = isChaser ? this.evader : this.chaser;
            let moveCmd = { angle: 0, move: true, warp: false };

            // 操作元の判定
            if (this.isPlayerMode && this.playerRole === (isChaser ? 'chaser' : 'evader')) {
                if (keys.has('a')) ent.angle -= 0.15;
                if (keys.has('d')) ent.angle += 0.15;
                moveCmd.move = keys.has('w');
                moveCmd.warp = keys.has(' ');
            } else {
                const inputs = [ent.x/200, ent.y/200, target.x/200, target.y/200, ent.angle/(Math.PI*2), ent.warpCooldown === 0 ? 1 : 0, (TOTAL_FRAMES - this.frame)/TOTAL_FRAMES];
                // NN簡易推論
                let outputs = [0, 0, 0];
                for(let i=0; i<3; i++) {
                    for(let j=0; j<7; j++) outputs[i] += inputs[j] * ent.dna[i*7 + j];
                }
                ent.angle += outputs[0] * 0.2;
                moveCmd.move = outputs[1] > 0;
                moveCmd.warp = outputs[2] > 0.8;
            }

            if (moveCmd.move) {
                ent.x += Math.cos(ent.angle) * 4;
                ent.y += Math.sin(ent.angle) * 4;
            }
            if (moveCmd.warp && ent.warpCooldown === 0) {
                ent.x += Math.cos(ent.angle) * 50;
                ent.y += Math.sin(ent.angle) * 50;
                ent.warpCooldown = 45;
            }

            ent.x = Math.max(0, Math.min(ROOM_SIZE, ent.x));
            ent.y = Math.max(0, Math.min(ROOM_SIZE, ent.y));
            if (ent.warpCooldown > 0) ent.warpCooldown--;
        });

        const dist = Math.hypot(this.chaser.x - this.evader.x, this.chaser.y - this.evader.y);
        if (dist < 12) {
            this.chaser.isAlive = false;
            this.chaser.score = 2000 + (TOTAL_FRAMES - this.frame);
            this.evader.score = this.frame;
        }
        this.frame++;
        
        if (this.frame >= TOTAL_FRAMES && this.chaser.isAlive) {
            this.chaser.score = Math.max(0, 500 - dist);
            this.evader.score = 1000 + dist;
        }
        this.draw();
    }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, ROOM_SIZE, ROOM_SIZE);
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(this.chaser.x-4, this.chaser.y-4, 8, 8);
        this.ctx.fillStyle = '#0ff';
        this.ctx.fillRect(this.evader.x-4, this.evader.y-4, 8, 8);
    }
}

// --- メイン管理 ---
let simulations: Simulation[] = [];
let generation = 0;
const keys = new Set<string>();
const container = document.getElementById('container')!;

window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function startGeneration() {
    container.innerHTML = '';
    const oldSims = [...simulations];
    simulations = [];

    // 次世代のDNA作成 (初回以外)
    let nextChaserDNAs = [];
    let nextEvaderDNAs = [];

    if (oldSims.length > 0) {
        const sortedChasers = oldSims.map(s => s.chaser).sort((a,b) => b.score - a.score);
        const sortedEvaders = oldSims.map(s => s.evader).sort((a,b) => b.score - a.score);
        for(let i=0; i<SIM_COUNT; i++) {
            // エリート上位5つのDNAをランダムに引き継ぎ＋突然変異
            const parentC = sortedChasers[Math.floor(Math.random()*5)].dna;
            const parentE = sortedEvaders[Math.floor(Math.random()*5)].dna;
            nextChaserDNAs.push(parentC.map(v => v + (Math.random()*0.2-0.1)));
            nextEvaderDNAs.push(parentE.map(v => v + (Math.random()*0.2-0.1)));
        }
    }

    for (let i = 0; i < SIM_COUNT; i++) {
        simulations.push(new Simulation(container, nextChaserDNAs[i], nextEvaderDNAs[i]));
    }
    generation++;
    document.getElementById('info')!.innerText = `世代: ${generation}`;
}

function loop() {
    simulations.forEach(sim => sim.update(keys));
    
    // 全シミュレーション終了チェック
    if (simulations.length > 0 && simulations.every(s => s.frame >= TOTAL_FRAMES || !s.chaser.isAlive)) {
        if (!simulations[0].isPlayerMode) startGeneration();
    }
    requestAnimationFrame(loop);
}

// --- イベントリスナー登録 ---
document.getElementById('startBtn')!.onclick = () => {
    generation = 0;
    startGeneration();
};

document.getElementById('playerChaserBtn')!.onclick = () => {
    startGeneration();
    simulations[0].isPlayerMode = true;
    simulations[0].playerRole = 'chaser';
};

document.getElementById('playerEvaderBtn')!.onclick = () => {
    startGeneration();
    simulations[0].isPlayerMode = true;
    simulations[0].playerRole = 'evader';
};

document.getElementById('exportBtn')!.onclick = () => {
    const data = {
        chaser: simulations[0].chaser.dna,
        evader: simulations[0].evader.dna
    };
    (document.getElementById('ioField') as HTMLInputElement).value = JSON.stringify(data);
};

document.getElementById('importBtn')!.onclick = () => {
    const val = (document.getElementById('ioField') as HTMLInputElement).value;
    const data = JSON.parse(val);
    simulations.forEach(s => {
        s.chaser.dna = [...data.chaser];
        s.evader.dna = [...data.evader];
    });
};

// ループ開始
loop();
