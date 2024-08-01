// declare var require: any;

const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);

import { Server } from "socket.io";

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

type Point = {
  x: number;
  y: number;
};

type DrawLine = {
  prevPoint: Point | null;
  currentPoint: Point;
  currentColor: string;
  room: string;
};

type User = {
  id: string;
  username: string;
  score: number;
};

type Room = {
  users: User[];
  drawingData: DrawLine[];
  currentWord: string;
  timer: NodeJS.Timeout | null;
  timeLeft: number;
  currentDrawer: string | null;
};


const MAX_PLAYERS_PER_ROOM = 8;
const GAME_TIME = 60; // 60 seconds per turn
const WORDS = ["apple", "banana", "cat", "dog", "elephant"]; // Example words
const rooms: { [key: string]: Room } = {};
const getAvailableRoom = (): string | null => {
  for (const room in rooms) {
    if (rooms[room].users.length < MAX_PLAYERS_PER_ROOM) {
      return room;
    }
  }
  return null;
};

const createNewRoom = (): string => {
  const newRoom = `room-${Date.now()}`;
  rooms[newRoom] = {
    users: [],
    drawingData: [],
    currentWord: "",
    timer: null,
    timeLeft: GAME_TIME,
    currentDrawer: null,
  };
  return newRoom;
};

function updateTimer(room: string) {
  if (!rooms[room]) return;

  rooms[room].timeLeft--;

  io.to(room).emit("timerUpdate", { timeLeft: rooms[room].timeLeft });

  if (rooms[room].timeLeft <= 0) {
    console.log("times up");

    clearTimeout(rooms[room].timer as NodeJS.Timeout);
    io.to(room).emit("time-up");
    nextTurn(room);
  } else {
    rooms[room].timer = setTimeout(() => updateTimer(room), 1000);
  }
}

function nextTurn(room: string) {
  const currentPlayerIndex = rooms[room].users.findIndex(
    (user) => user.id === rooms[room].currentDrawer
  );
  console.log("finding next player", `current is${currentPlayerIndex}`);

  if (currentPlayerIndex || currentPlayerIndex === 0) {
    const nextPlayerIndex = (currentPlayerIndex + 1) % rooms[room].users.length;
    console.log(`next player ${nextPlayerIndex}`);

    rooms[room].currentDrawer = rooms[room].users[nextPlayerIndex].id;
  } else {
    rooms[room].currentDrawer = rooms[room].users[0].id;
  }

  startRound(room);
}

const startRound = (room: string) => {
  if (!rooms[room]) return;
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  rooms[room].currentWord = word;
  rooms[room].timeLeft = GAME_TIME;

  let cDrawer = rooms[room].currentDrawer;
  if (!cDrawer) return;

  io.to(cDrawer).emit("your-turn", {
    word: word,
    timeLeft: GAME_TIME,
    drawer: cDrawer,
  });

  io.to(room).emit("new-round", {
    timeLeft: GAME_TIME,
    drawer: cDrawer,
  });

  if (rooms[room].timer) clearTimeout(rooms[room].timer);

  rooms[room].timer = setTimeout(() => updateTimer(room), 1000);


io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("play", ({ username }) => {
    let room = getAvailableRoom();
    if (!room) {
      room = createNewRoom();

      socket.join(room);
      rooms[room].users.push({ id: socket.id, username, score: 0 });

      nextTurn(room);
    } else {
      socket.join(room);
      rooms[room].users.push({ id: socket.id, username, score: 0 });
    }

    socket.emit("roomAssignment", {
      room,
      drawingData: rooms[room].drawingData,
      pName: username,
      currentWord: rooms[room].currentWord,
      currentDrawer: rooms[room].currentDrawer,
    });

    // Notify everyone in the room
    io.to(room).emit("newUserJoined", {
      pName: username,
      players: rooms[room].users.map((u) => u.username),
    });
  });

  socket.on("guess", ({ room, guess, userId }) => {
    if (
      rooms[room] &&
      guess.toLowerCase() === rooms[room].currentWord.toLowerCase()
    ) {
      // Calculate score based on remaining time
      const score = Math.ceil(
        rooms[room].timer ? (rooms[room].timer as any)._idleTimeout / 1000 : 0
      );
      // Update user's score
      const user = rooms[room].users.find((u) => u.id === userId);
      if (user) user.score = (user.score || 0) + score;
      io.to(room).emit("correct-guess", { userId, score });
      // nextTurn(room);
    } else {
      socket.to(room).emit("wrong-guess", { userId, guess });
    }
  });

  socket.on(
    "draw-line",
    ({ prevPoint, currentPoint, currentColor, room }: DrawLine) => {
      if (rooms[room]) {
        const newLine = { prevPoint, currentPoint, currentColor, room };
        rooms[room].drawingData.push(newLine);
        io.in(room).emit("draw-line", newLine);
      }
    }
  );
  //   socket.on("clear", () => io.emit("clear"));
  socket.on("clear", (room) => {
    if (rooms[room]) {
      rooms[room].drawingData = [];
      io.in(room).emit("clear");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    for (const room in rooms) {
      rooms[room].users = rooms[room].users.filter(
        (user) => user.id !== socket.id
      );
      if (rooms[room].users.length === 0) {
        delete rooms[room];
      }
    }
  });
});

server.listen(3001, () => {
  console.log(`server listenig on port ${3001}`);
});
