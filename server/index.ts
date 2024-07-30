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
};

type Room = {
  users: User[];
  drawingData: DrawLine[];
  currentWord: string;
  timer: NodeJS.Timeout | null;
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
  rooms[newRoom] = { users: [], drawingData: [], currentWord: "", timer: null };
  return newRoom;
};

// Function to start a new round
const startRound = (room: string) => {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  rooms[room].currentWord = word;
  io.to(room).emit("new-round", { word });

  if (rooms[room].timer) clearTimeout(rooms[room].timer);
  rooms[room].timer = setTimeout(() => {
    io.to(room).emit("time-up");
    startRound(room);
  }, GAME_TIME * 1000);
};

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("play", ({ username }) => {
    let room = getAvailableRoom();
    if (!room) {
      room = createNewRoom();
    }

    socket.join(room);
    rooms[room].users.push({ id: socket.id, username });

    // Send the current drawing state to the newly joined user
    socket.emit("roomAssignment", {
      room,
      drawingData: rooms[room].drawingData,
      pName: username,
    });

    // // Notify others in the room
    // socket.to(room).emit("newUserJoined", {

    // });

    // Notify everyone in the room
    io.to(room).emit("newUserJoined", {
      pName: username,
      players: rooms[room].users.map((u) => u.username),
    });
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
