/**
 * Room Controller
 *
 * @param {RoomRepository} repository
 * @param {GameController} gameController
 */
function RoomController(repository, gameController)
{
    EventEmitter.call(this);

    var controller = this;

    this.socketGroup    = new SocketGroup();
    this.repository     = repository;
    this.gameController = gameController;

    this.endGame       = this.endGame.bind(this);
    this.onPlayerLeave = this.onPlayerLeave.bind(this);

    this.callbacks = {
        emitAllRooms: function () { controller.emitAllRooms(this); },
        onCreateRoom: function (data) { controller.onCreateRoom(this, data.data, data.callback); },
        onJoinRoom: function (data) { controller.onJoinRoom(this, data.data, data.callback); },
        onTalk: function (data) { controller.onTalk(this, data.data, data.callback); },
        onLeaveRoom: function () { controller.onLeaveRoom(this); },
        onAddPlayer: function (data) { controller.onAddPlayer(this, data.data, data.callback); },
        onReadyRoom: function (data) { controller.onReadyRoom(this, data.data, data.callback); },
        onColorRoom: function (data) { controller.onColorRoom(this, data.data, data.callback); }
    };
}

RoomController.prototype = Object.create(EventEmitter.prototype);
RoomController.prototype.constructor = RoomController;

/**
 * Attach events
 *
 * @param {SocketClient} client
 */
RoomController.prototype.attach = function(client)
{
    if (this.socketGroup.clients.add(client)) {
        this.attachEvents(client);
    }
};

/**
 * Attach events
 *
 * @param {SocketClient} client
 */
RoomController.prototype.detach = function(client)
{
    if (this.socketGroup.clients.remove(client)) {
        this.detachEvents(client);
    }
};

/**
 * Detach events
 *
 * @param {SocketClient} client
 */
RoomController.prototype.attachEvents = function(client)
{
    client.on('room:fetch', this.callbacks.emitAllRooms);
    client.on('room:create', this.callbacks.onCreateRoom);
    client.on('room:join', this.callbacks.onJoinRoom);
    client.on('room:talk', this.callbacks.onTalk);
    client.on('room:leave', this.callbacks.onLeaveRoom);
    client.on('room:player:add', this.callbacks.onAddPlayer);
    client.on('room:ready', this.callbacks.onReadyRoom);
    client.on('room:color', this.callbacks.onColorRoom);
};

/**
 * Detach events
 *
 * @param {SocketClient} client
 */
RoomController.prototype.detachEvents = function(client)
{
    client.removeListener('room:fetch', this.callbacks.emitAllRooms);
    client.removeListener('room:create', this.callbacks.onCreateRoom);
    client.removeListener('room:join', this.callbacks.onJoinRoom);
    client.removeListener('room:talk', this.callbacks.onTalk);
    client.removeListener('room:leave', this.callbacks.onLeaveRoom);
    client.removeListener('room:player:add', this.callbacks.onAddPlayer);
    client.removeListener('room:ready', this.callbacks.onReadyRoom);
    client.removeListener('room:color', this.callbacks.onColorRoom);
};

/**
 * Emit all rooms to the given client
 *
 * @param {SocketClient} client
 */
RoomController.prototype.emitAllRooms = function(client)
{
    var events = [];

    for (var i = this.repository.rooms.items.length - 1; i >= 0; i--) {
        events.push(['room:new', this.repository.rooms.items[i].serialize()]);
    }

    client.addEvents(events);
};

// Events:

/**
 * On new room
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onCreateRoom = function(client, data, callback)
{
    var room = this.repository.create(data.name.substr(0, Room.prototype.maxLength));

    callback({success: room ? true : false, room: room? room.name : null});

    if (room) {
        room.on('player:leave', this.onPlayerLeave);
        this.socketGroup.addEvent('room:new', room.serialize());
    }
};

/**
 * On join room
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onJoinRoom = function(client, data, callback)
{
    var room = this.repository.get(data.room);

    if (room) {
        room.addClient(client);
        callback({success: true});

        if (room.game) {
            this.detach(client);
            this.gameController.attach(client);
            client.addEvent('room:game:start', {room: room.name});
        }
    } else {
        callback({success: false});
    }
};

/**
 * On leave room
 *
 * @param {SocketClient} client
 */
RoomController.prototype.onLeaveRoom = function(client)
{
    var room = client.room;

    if (room) {

        if (client.room.game) {
            this.gameController.detach(client);
        }

        room.removeClient(client);
        this.checkRoomClose(room);
    }
};

/**
 * On player leave
 *
 * @param {Object} data
 */
RoomController.prototype.onPlayerLeave = function(data)
{
    this.socketGroup.addEvent('room:leave', {room: data.room.name, player: data.player.name});
};

/**
 * Check room closing
 *
 * @param {Room} room
 */
RoomController.prototype.checkRoomClose = function(room)
{
    if (room.clients.isEmpty() && this.repository.remove(room)) {
        this.socketGroup.addEvent('room:close', {room: room.name});
    }
};

/**
 * On add player to room
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onAddPlayer = function(client, data, callback)
{
    var name = data.name.substr(0, Player.prototype.maxLength);

    if (client.room && client.room.isNameAvailable(name)) {

        var player = new Player(client, name);

        client.room.addPlayer(player);
        client.players.add(player);

        callback({success: true});

        this.socketGroup.addEvent('room:join', {room: client.room.name, player: player.serialize()});
    } else {
        callback({success: false});
    }
};

/**
 * On talk
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onTalk = function(client, data, callback)
{
    var room = client.room,
        message = new Message(client.players.getById(data.player), data.content),
        success = room && data.content.length;

    callback({success: success});

    if (success) {
        room.client.addEvent('room:talk', message.serialize());
    }
};

/**
 * On new room
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onColorRoom = function(client, data, callback)
{
    var room = client.room,
        player = client.players.getById(data.player);

    if (room && player && player.validateColor(data.color)) {
        player.setColor(data.color);
        callback({success: true, color: player.color});

        room.client.addEvent('room:player:color', { player: player.name, color: player.color, room: room.name });
    } else {
        callback({success: false, color: player.color});
    }
};

/**
 * On new room
 *
 * @param {SocketClient} client
 * @param {Object} data
 * @param {Function} callback
 */
RoomController.prototype.onReadyRoom = function(client, data, callback)
{
    var room = client.room,
        player = client.players.getById(data.player);

    if (room && player) {
        player.toggleReady();

        callback({success: true, ready: player.ready});

        room.client.addEvent('room:player:ready', { player: player.name, ready: player.ready, room: room.name });

        if (room.isReady()) {
            this.startGame(room);
        }
    }
};

/**
 * Warmup room
 *
 * @param {Room} room
 */
RoomController.prototype.startGame = function(room)
{
    var game = room.newGame();

    this.emit('game:new', {game: game});

    this.socketGroup.addEvent('room:game:start', {room: room.name});

    /*for (var i = room.clients.items.length - 1; i >= 0; i--) {
        this.detach(room.clients.items[i]);
    }*/

    this.gameController.addGame(game);
    game.on('end', this.endGame);
};

/**
 * End game
 *
 * @param {Object} data
 */
RoomController.prototype.endGame = function(data)
{
    var game = data.game,
        room = game.room,
        client;

    this.socketGroup.addEvent('room:game:end', {room: room.name});

    this.gameController.removeGame(game);

    /*for (var i = room.clients.items.length - 1; i >= 0; i--) {
        client = room.clients.items[i];
        this.attach(client);
        this.emitAllRooms(client);
    }*/

    room.closeGame();
};
