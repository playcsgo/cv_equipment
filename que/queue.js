const amqp = require('amqplib');

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  if (!connection) {
    connection = await amqp.connect('amqp://localhost');
  }
  if (!channel) {
    channel = await connection.createChannel();
  }
  return { connection, channel };
};

const getChannel = async () => {
  if (!channel) {
    await connectRabbitMQ();
  }
  return channel;
};

const sendToQueue = async (queueName, message) => {
  const channel = await getChannel();
  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(message));
};

// .consume is subscription
const consumeQueue = async (queueName, callback) => {
  const channel = await getChannel();
  await channel.assertQueue(queueName, { durable: true });
  channel.consume(queueName, msg => {
    callback(msg, () => channel.ack(msg))
  }, { noAck: true });
};

module.exports = { sendToQueue, consumeQueue };
