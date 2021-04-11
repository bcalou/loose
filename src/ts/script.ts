import "phaser";
import { deflate } from "zlib";
/**
 *
 * !!!OK!!! capter les inputs manette
 *
 * !!!OK!!! lancer un grappin dans une direction
 *
 * !!!OK!!! accrocher legrapin joueur-----(grappin)-----poule
 *
 * !!!OK!!! relacher grappin
 *
 * !!!OK!!! fullscreen
 *
 * !!!OK!!! ajout joueur 2/n
 *
 * mourrir joueur
 *
 * afficher direction grapin
 * faire que les poules sa descend (ou que on monte)
 *
 * rembobiner / débobiner grappin
 *
 * pondre oeuf
 *
 * percuter oeuf
 *
 * frapper oeuf
 *
 * multijoueur online
 *
 * design
 *
 * nuages en parralaxe
 *
 * son
 *
 */

var config = {
  type: Phaser.WEBGL,
  width: 1920,
  height: 1080,
  scale: {
    mode: Phaser.Scale.FIT,
    parent: "poulepull",
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1920,
    height: 1080,
  },
  input: {
    gamepad: true,
  },
  backgroundColor: "#53d8ed",
  physics: {
    default: "matter",
    matter: {
      gravity: {
        y: 0.8,
      },
      debug: true,
      debugBodyColor: 0xffffff,
    },
  },
  scene: {
    preload,
    create,
    update,
  },
};

const CAMERA_SPEED = 0.05;
const CAMERA_SMOOTHNESS = 0.05;
const CAMERA_INITIAL_POSITION = 750;
const CAMERA_OFFSET = 200;

const CHICKEN_INTERVAL_MS = 500;
const CHICKEN_SIZE = 100;
const CHICKEN_TARGET_Y = {
  max: config.height - 300,
  min: -config.height - CHICKEN_SIZE - 1000,
};
const CHICKEN_WING_FORCE = { x: 0.03, y: -0.5 };
const CHICKEN_SPAWN_OFFSET = 0;
const CHICKEN_MIN_SPAWN_HEIGHT = 1000;

const PLAYER_WIDTH = 100;
const PLAYER_HEIGHT = 150;
const PLAYER_DEATH_OFFSET = 100;
const PLAYER_JUMP_RATIO = 0.5;

const MAX_GRABBER_DISTANCE = 900;
const GRABBER_THROW_FORCE = 0.03;

const SPRING_ATTACHMENT_RATIO = 0.9; // between 0 & 1
const SPRING_ADJUSTMENT_SPEED = 350;
const SPRING_MAX_LENGTH = 700;
const SPRING_MIN_LENGTH = CHICKEN_SIZE / 2 + PLAYER_HEIGHT / 2;
const SPRING_STIFFNESS = 0.3;
const SPRING_HORIZONTAL_MOVE_FACTOR = 0.01;

const PAD_TRIGGER_THRESHOLD = 0.8;

const WATER_SPEED = 0.05;

var game: any = new Phaser.Game(config);
var rnd = Phaser.Math.RND;

function preload() {
  for (let i = 1; i <= 9; i++) {
    this.load.audio("cri_" + i, "sound/cri_" + i + ".mp3");
    this.load.audio("player_" + i, "sound/player_" + i + ".mp3");
  }

  for (let i = 1; i <= 7; i++) {
    this.load.audio("death_" + i, "sound/death_" + i + ".mp3");
  }

  this.load.audio("music", "sound/music.mp3");
  this.load.audio("wings", "sound/wings.mp3");
  this.load.audio("bg", "sound/bg.mp3");

  for (let playerNumber = 1; playerNumber <= 4; playerNumber++) {
    this.load.image(`player_${playerNumber}`, `img/player_${playerNumber}.png`);
    this.load.image(`batte_${playerNumber}`, `img/batte_${playerNumber}.png`);
    this.load.image(
      `grabber_${playerNumber}`,
      `img/grabber_${playerNumber}.png`
    );
  }

  this.load.image("grenier", "img/grenier.png");
  this.load.image("pieds", "img/pieds.png");
  this.load.image("sticky", "img/sticky.png");
  this.load.image("appuyezPourCommencer", "img/appuyezPourCommencer.png");

  this.load.spritesheet("chicken", "img/chicken.png", {
    frameWidth: 200,
    frameHeight: 200,
  });
}

function create() {
  this.mainGroup = this.matter.world.nextGroup(true);
  this.gameIsActive = false;

  this.text = this.add
    .text(32, 32)
    .setScrollFactor(0)
    .setFontSize(32)
    .setColor("#000000");

  createAnimations.call(this);
  createScene.call(this);

  //fullscreen avec F
  var FKey = this.input.keyboard.addKey("F");
  FKey.on(
    "down",
    function () {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    },
    this
  );

  function createScene() {
    this.add.image(
      config.width / 2,
      config.height + config.height / 2 + 250,
      "grenier"
    );
  }

  createPlayers.call(this);
  this.cameras.main.scrollY = config.height + 350;
  //debug
  this.matter.add.mouseSpring();

  this.matter.world.setBounds(
    0,
    0,
    config.width,
    config.height,
    64,
    false,
    false,
    false,
    true
  );
  // set the horizontal dead zone to 1.5x game width (experimental)
  //this.cameras.main.setDeadzone(this.scale.width * 1.5);
  //this.matter.world.setBounds(0, -100 * config.height, config.width, config.height * 100);
  createChickens.call(this);
  generateInitialChicken.call(this);

  this.sound.play("music", { volume: 0.15, loop: true });
  this.sound.play("wings", { volume: 0.5, loop: true });
  this.sound.play("bg", { volume: 0.3, loop: true });
}

function update(time, delta) {
  updatePlayers.call(this, delta);
  if (Math.random() < delta / CHICKEN_INTERVAL_MS) {
    generateChicken.call(this);
  }
  updateChicken.call(this);

  if (this.gameIsActive) {
    updateCamera.call(this, delta);
    updateWater.call(this, delta);

    this.text.setText(
      this.scores.map((score, index) => {
        return `Joueur ${index + 1} : ${score.points / 100}m`;
      })
    );
  }
}

function updateCamera(delta) {
  if (this.players.length) {
    let Ymean = Phaser.Math.Average(
      this.players.map((player) =>
        Math.min(player.position.y - CAMERA_OFFSET, CAMERA_INITIAL_POSITION)
      )
    );

    this.cameras.main.scrollY = Phaser.Math.Linear(
      Ymean - config.height / 2,
      this.cameras.main.scrollY,
      delta * CAMERA_SMOOTHNESS
    );
  }
}

function createAnimations() {
  const framerate = 15;

  this.anims.create({
    key: "idle",
    frames: this.anims.generateFrameNumbers("chicken", {
      frames: [0, 1],
    }),
    frameRate: framerate,
    repeat: -1,
  });
  this.anims.create({
    key: "flap",
    frames: this.anims.generateFrameNumbers("chicken", {
      frames: [1, 2, 3, 4, 5],
    }),
    frameRate: framerate * 2,
    repeat: 0,
  });
  this.anims.create({
    key: "flop",
    frames: this.anims.generateFrameNumbers("chicken", {
      frames: [6, 7],
    }),
    frameRate: framerate,
    repeat: 0,
  });
  this.anims.create({
    key: "full",
    frames: this.anims.generateFrameNumbers("chicken"),
    frameRate: framerate,
    repeat: -1,
  });
}

function updatePlayers(delta) {
  this.players.forEach((player) => {
    updatePlayerScore.call(this, player);
    updatePlayerSprite.call(this, player);
    checkIfDead.call(this, player);
    checkGrabberDistance.call(this, player);

    var pad = player._pad;

    if (pad.A) {
      if (!this.gameIsActive) {
        createWater.call(this);
        this.gameIsActive = true;
      }
    }

    if (!this.gameIsActive) {
      return;
    }

    player._leftStick = new Phaser.Math.Vector2(
      pad.axes[0].getValue(),
      pad.axes[1].getValue()
    );

    let _rightStick = new Phaser.Math.Vector2(
      pad.axes[2].getValue(),
      pad.axes[3].getValue()
    );

    if (player._grabber) {
      if (pad.buttons[6].value < PAD_TRIGGER_THRESHOLD) {
        recallGrabber.call(this, player);
      }
    } else if (player._spring) {
      if (pad.buttons[6].value < PAD_TRIGGER_THRESHOLD) {
        release.call(this, player);
      } else {
        adjustSpringLength.call(this, player, delta);
        applyAirControl.call(this, player);
      }
    } else {
      if (pad.buttons[6].value > PAD_TRIGGER_THRESHOLD) {
        fire.call(this, player);
      }
    }
  });
}

function updatePlayerSprite(player) {
  //SPRITE POSITION UPDATE
  player._sprite.setPosition(player.position.x, player.position.y);
  player._sprite.rotation = player.angle;
}

function updatePlayerScore(player) {
  player._score.points = Math.max(
    Math.floor(-(player.position.y - player._startingPositionY)),
    player._score.points
  );
}

function checkIfDead(player) {
  if (
    player.position.y >
      this.cameras.main.scrollY + config.height + PLAYER_DEATH_OFFSET ||
    (this.water &&
      player.position.y >
        this.water.y - this.water.height / 2 + PLAYER_HEIGHT / 2)
  ) {
    if (player._grabber) {
      this.matter.world.remove(player._grabber);
    }
    if (player._spring) {
      this.matter.world.remove(player._spring);
    }
    player._sprite.destroy();
    this.matter.world.remove(player);
    this.players = this.players.filter((_player) => _player.id !== player.id);
    this.sound.play("death_" + rnd.between(1, 7), { volume: 0.5 });

    if (this.players.length === 0) {
      end.call(this);
    }
  }
}

function checkGrabberDistance(player) {
  if (
    player._grabber &&
    Phaser.Math.Distance.BetweenPoints(
      player.position,
      player._grabber.position
    ) > MAX_GRABBER_DISTANCE
  ) {
    this.matter.world.remove(player._grabber);
    delete player._grabber;
  }
}

function createPlayers() {
  this.players = [];
  this.scores = [];
  this.input.gamepad.once("connected", (pad) => {
    this.input.gamepad.gamepads.forEach((pad, index) => {
      createPlayer.call(this, pad, index);
    });
  });
}

function createPlayer(pad, index) {
  const startingPositions = [0.15, 0.85, 0.4, 0.6];

  var player = this.matter.add.rectangle(
    config.width * startingPositions[index],
    this.cameras.main.y + 1080 - PLAYER_HEIGHT / 2,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    {
      collisionFilter: {
        group: this.mainGroup,
      },
    }
  );

  player._sprite = this.add.image(
    config.width * startingPositions[index],
    this.cameras.main.y + 1080 - PLAYER_HEIGHT / 2,
    "player_" + (index + 1)
  );

  player._pad = pad;
  player._score = this.scores[index] = { points: 0 };
  player._startingPositionY = player.position.y;

  this.players.push(player);
}

function fire(player) {
  player._grabber = this.matter.add.circle(
    player.position.x,
    player.position.y - PLAYER_HEIGHT / 2,
    10,
    {
      onCollideCallback: (collision) => {
        // Si l'élément visé est chicken
        if (collision.bodyA.label === "chicken") {
          if (player._grabber) {
            this.matter.world.remove(player._grabber);
            delete player._grabber;
          }

          // si ce n'est pas le chicken déjà grabbé
          if (
            !player._spring ||
            player._spring.bodyB.id !== collision.bodyA.id
          ) {
            attachPlayerToChicken.call(this, player, collision.bodyA);
          }
        }
      },
    }
  );

  const grabberForce = player._leftStick
    .normalize()
    .multiply(
      new Phaser.Math.Vector2(GRABBER_THROW_FORCE, GRABBER_THROW_FORCE)
    );
  this.matter.applyForce(player._grabber, grabberForce);
}

function recallGrabber(player) {
  this.matter.world.remove(player._grabber);
  delete player._grabber;
}

function release(player) {
  const chicken = player._spring.bodyB;
  chicken._targetY += 100;

  this.matter.world.remove(player._spring);
  delete player._spring;

  jump.call(this, player);
}

function adjustSpringLength(player, delta) {
  // ajuster la longueur du grab en fonction de player._leftStick.y (multiplié par un constante)
  player._spring.length = Phaser.Math.Clamp(
    player._spring.length +
      player._leftStick.y * ((SPRING_ADJUSTMENT_SPEED / 1000) * delta),
    SPRING_MIN_LENGTH,
    SPRING_MAX_LENGTH
  );
}

function jump(player) {
  this.sound.play("player_" + rnd.between(1, 9), { volume: 0.5 });

  this.matter.applyForce(
    player,
    player._leftStick
      .normalize()
      .multiply({ x: PLAYER_JUMP_RATIO, y: PLAYER_JUMP_RATIO })
  );
}

function applyAirControl(player) {
  // appliquer une force horizontale sur le player en fonction de player._leftStick.x (multiplié par un constante)
  this.matter.applyForce(
    player,
    new Phaser.Math.Vector2(
      player._leftStick.x * SPRING_HORIZONTAL_MOVE_FACTOR,
      0
    )
  );
}

function attachPlayerToChicken(player, chicken) {
  // Remove existing spring
  if (player._spring) {
    this.matter.world.remove(player._spring);
  }

  player._spring = this.matter.add.spring(
    player,
    chicken,
    Math.max(
      Phaser.Math.Distance.BetweenPoints(player.position, chicken.position) *
        SPRING_ATTACHMENT_RATIO,
      SPRING_MIN_LENGTH
    ),
    SPRING_STIFFNESS
  );

  this.sound.play("cri_" + rnd.between(1, 9), { volume: 0.5 });
}

function createChickens() {
  this.chickens = [];
}

function generateChicken(initial = false) {
  var targetY = Phaser.Math.Between(
    CHICKEN_TARGET_Y.min + this.cameras.main.scrollY - CHICKEN_SPAWN_OFFSET,
    CHICKEN_TARGET_Y.max + this.cameras.main.scrollY - CHICKEN_SPAWN_OFFSET
  );

  if (targetY > CHICKEN_MIN_SPAWN_HEIGHT) {
    return;
  }

  var chickenX =
    targetY < this.cameras.main.scrollY - CHICKEN_SIZE || initial
      ? rnd.between(-CHICKEN_SIZE, config.width + CHICKEN_SIZE)
      : rnd.pick([-CHICKEN_SIZE, config.width + CHICKEN_SIZE]);

  console.log(chickenX, targetY);

  var chicken = this.matter.add.circle(
    chickenX,
    targetY + 50 + this.cameras.main.y,
    CHICKEN_SIZE / 2,
    {
      collisionFilter: {
        group: this.mainGroup,
      },
      label: "chicken",
    }
  );

  chicken._sprite = this.add.sprite(600, 370);
  chicken._sprite.play("full");

  chicken._targetY = targetY;
  chicken._forceVector = {
    x: CHICKEN_WING_FORCE.x * (chickenX < config.width / 2 ? 1 : -1),
    y: CHICKEN_WING_FORCE.y,
  };

  this.chickens.push(chicken);
}

function generateInitialChicken() {
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      generateChicken.call(this, true);
    }, Math.random() * 1000);
  }
}

function updateChicken() {
  this.chickens.forEach((chicken) => {
    if (!chicken._prevVelocityY) {
      chicken._prevVelocityY = chicken.velocity.y;
    }

    // CHICKEN DROWNING
    if (
      this.water &&
      chicken.position.y > this.water.y - this.water.height / 2
    ) {
      if (!chicken._dead) {
        if (chicken.position.y < this.cameras.main.scrollY + config.height) {
          this.sound.play("death_6");
        } else {
          console.log("die out");
        }
        chicken._dead = true;
      }
    }

    //CHICKEN REMOVING
    if (
      (chicken.velocity.x > 0 &&
        chicken.position.x > config.width + CHICKEN_SIZE) ||
      (chicken.velocity.x < 0 && chicken.position.x < -CHICKEN_SIZE)
    ) {
      this.chickens = this.chickens.filter(
        (_chicken) => _chicken.id !== chicken.id
      );
      this.matter.world.remove(chicken);
    }

    //SPRITE POSITION UPDATE
    chicken._sprite.setPosition(chicken.position.x, chicken.position.y);

    //SPRITE ORIENTATION UPDATE
    chicken._sprite.setFlipX(chicken.velocity.x > 0);

    //CHICKEN FLAPPING
    //si ça tombe
    if (chicken.velocity.y > 0 && !chicken._dead) {
      //si c'est trop bas
      if (chicken.position.y > chicken._targetY) {
        // console.log("chicken.position.y", chicken.position.y);
        this.matter.applyForce(chicken, chicken._forceVector);
        chicken._sprite.play("flap");
      } else if (chicken._prevVelocityY < 0 && chicken.velocity.y > 0) {
        //apogée
        chicken._sprite.play("flop");
        chicken._sprite.anims.chain("idle");
      }
    }

    //laisser à la fin
    chicken._prevVelocityY = chicken.velocity.y;
  });
}

function createWater() {
  let waterGroup = this.matter.world.nextGroup(true);

  this.water = this.add.rectangle(0, 1920, config.width * 2, config.height);

  setTimeout(() => {
    this.water.setFillStyle(0x2222dd, 0.8);
  }, 1000);
}

function updateWater(delta) {
  this.water.y -= delta * (WATER_SPEED + this.players[0]._score.points / 50000);
}

function end() {
  this.gameIsActive = false;
  console.log("game over");
}
