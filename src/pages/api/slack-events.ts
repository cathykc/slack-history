import { PrismaClient } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";

const prisma = new PrismaClient();

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const { event } = req.body;

  if (!event) {
    res.status(200).json({ challenge: req.body.challenge });
    return;
  }

  console.log("Received event:", event);

  const updatedAt = new Date();

  if (event.type !== "message") {
    res.status(200).end();
    return;
  }

  if (event.type !== "message") {
    res.status(200).end();
    return;
  }

  if (event.subtype === "message_changed") {
    const { message } = event;

    if (message.thread_ts && message.thread_ts !== message.ts) {
      await prisma.slackReply.upsert({
        where: { ts_parentTs: {
          ts: message.ts,
          parentTs: message.thread_ts
        } },
        update: {
          data: message,
          updatedAt,
        },
        create: {
          ts: message.ts,
          parentTs: message.thread_ts,
          data: message,
          updatedAt,
        }
      })
    } else {
      await prisma.slackMessage.upsert({
        where: { ts_channel: {
          ts: message.ts,
          channel: event.channel
        } },
        update: {
          data: message,
          updatedAt,},
        create: {
          ts: message.ts,
          channel: event.channel,
          data: message,
          updatedAt,
        }
      })
    }


    res.status(200).end();
    return;
  }

  if (!event.subtype) {
    if (event.thread_ts && event.thread_ts !== event.ts) {
      await prisma.slackReply.upsert({
        where: { ts_parentTs: {
          ts: event.ts,
          parentTs: event.thread_ts
        } },
        update: {},
        create: {
          ts: event.ts,
          parentTs: event.thread_ts,
          data: event,
          updatedAt,
        }
      })
    } else {
      await prisma.slackMessage.upsert({
        where: { ts_channel: {
          ts: event.ts,
          channel: event.channel
        } },
        update: {},
        create: {
          ts: event.ts,
          channel: event.channel,
          data: event,
          updatedAt,
        }
      })
    }
    res.status(200).end();
    return;
  }

  res.status(200).end();
};