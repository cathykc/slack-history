const { PrismaClient } = require('@prisma/client')
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { concat, filter, map } = require("lodash");


const prisma = new PrismaClient();

const fetchMap = {
  slackUsersFetchedAt: null,
  slackConversationsFetchedAt: null,
}

const backfillCutoffTs = "1681233252.216899";

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const fetchSlackUsers = async (cursor) => {
  const response = await fetch(`https://slack.com/api/users.list${cursor ? `?cursor=${cursor}` : ""}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
    },
  })

  if (response.status === 429) {
    console.log("Rate limited users.list")
    await sleep(30*1000);
    return fetchSlackUsers(cursor);
  }

  if (response.status !== 200) {
    console.log("Failed to fetch slackUsers:", response);
    return [];
  }

  const responseBody = await response.json();
  if (!responseBody.ok) {
    console.log("Failed to fetch slackUsers (SlackAPI error):", responseBody);
    return [];
  }

  if (responseBody.response_metadata?.next_cursor) {
    const nextMembers = await fetchSlackUsers(responseBody.response_metadata.next_cursor);
    return concat(response.members, nextMembers);
  }

  return responseBody.members;
}

const fetchSlackConversations = async (cursor) => {
  const response = await fetch(`https://slack.com/api/conversations.list${cursor ? `?cursor=${cursor}` : ""}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
    },
  })

  if (response.status === 429) {
    console.log("Rate limited conversations.list")
    await sleep(30*1000);
    return fetchSlackConversations(cursor);
  }

  if (response.status !== 200) {
    console.log("Failed to fetch slackConversations:", response);
    return [];
  }

  const responseBody = await response.json();
  if (!responseBody.ok) {
    console.log("Failed to fetch slackConversations (SlackAPI error):", responseBody);
    return [];
  }

  if (responseBody.response_metadata?.next_cursor) {
    const nextConversations = await fetchSlackConversations(responseBody.response_metadata.next_cursor);
    return concat(response.channels, nextConversations);
  }

  return responseBody.channels;
}

const fetchConversationHistory = async (channelId, latestThreadTs) => {
  const response = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&latest=${latestThreadTs}&limit=500`,
  {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
    },
  })

  if (response.status === 429) {
    console.log("Rate limited conversations.history")
    return [[], latestThreadTs];
  }

  if (response.status !== 200) {
    console.log("Failed to fetch conversation history:", response);
    return [[], latestThreadTs];
  }

  const responseBody = await response.json();
  if (!responseBody.ok) {
    console.log("Failed to fetch conversation history (SlackAPI error):", responseBody);
    if (responseBody.error === "not_in_channel") {
      console.log("Joining channel", channelId);
      const joinResponse = await fetch(`https://slack.com/api/conversations.join?channel=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
        },
      });
      const joinResponseBody = await joinResponse.json();
      if (!joinResponseBody.ok) {
        console.log("Failed to join channel:", joinResponseBody);
        return [[], null];
      }

      return await fetchConversationHistory(channelId, latestThreadTs);
    }

    return [[], latestThreadTs];
  }

  return [responseBody.messages, responseBody.has_more ? responseBody.messages[responseBody.messages.length - 1].ts : null];
}

const fetchConversationReplies = async (channelId, ts) => {
  console.log("Fetching conversation replies", channelId, ts);
  const response = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=999`,
  {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
    },
  })

  if (response.status === 429) {
    console.log("Rate limited conversations.replies")
    return null;
  }

  if (response.status !== 200) {
    console.log("Failed to fetch conversations.replies:", response);
    return null;
  }

  const responseBody = await response.json();
  if (!responseBody.ok) {
    if (responseBody.error === "thread_not_found") {
      return [];
    }

    console.log("Failed to fetch conversations.replies (SlackAPI error):", responseBody);
    return null;
  }

  return responseBody.messages;
}

const main = async () => {
  console.log("------------------");

  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  if (!fetchMap.slackUsersFetchedAt || fetchMap.slackUsersFetchedAt < oneDayAgo) {
    console.log("Fetching slackUsers. Last fetchedAt", fetchMap.slackUsersFetchedAt);
    const slackUsers = await fetchSlackUsers();

    const updatedAt = new Date();
    for (const slackUser of slackUsers) {
      await prisma.slackUser.upsert({
        where: { id: slackUser.id },
        update: {
          data: slackUser,
          updatedAt,
        },
        create: {
          id: slackUser.id,
          data: slackUser,
          updatedAt,
        }
      })
    }

    fetchMap.slackUsersFetchedAt = new Date();
  }

  if (!fetchMap.slackConversationsFetchedAt || fetchMap.slackConversationsFetchedAt < oneDayAgo) {
    console.log("Fetching slackConversations. Last fetchedAt", fetchMap.slackConversationsFetchedAt);
    const slackConversations = await fetchSlackConversations();

    const updatedAt = new Date();
    for (const slackConversation of slackConversations) {
      await prisma.slackConversation.upsert({
        where: { id: slackConversation.id },
        update: {
          data: slackConversation,
          updatedAt,
        },
        create: {
          id: slackConversation.id,
          data: slackConversation,
          updatedAt,
        }
      });

      await prisma.backfillChannel.upsert({
        where: { channel: slackConversation.id },
        update: {},
        create: {
          channel: slackConversation.id,
          latestTs: backfillCutoffTs,
          completedAt: null,
        }
      });
    }

    fetchMap.slackConversationsFetchedAt = new Date();
  }

  const backfillChannels = await prisma.backfillChannel.findMany({
    where: {
      completedAt: null,
    }
  });
  console.log(`${backfillChannels.length} channels to backfill`);
  for (backfillChannel of backfillChannels) {
    const [messages, latestTs] = await fetchConversationHistory(backfillChannel.channel, backfillChannel.latestTs);
    console.log(`Fetched ${messages.length} messages for ${backfillChannel.channel}:`, latestTs);
    
    await prisma.slackMessage.createMany({
      data: map(messages, (message) => ({
        ts: message.ts,
        channel: backfillChannel.channel,
        data: message,
        updatedAt: new Date(),
      })),
      skipDuplicates: true,
    });

    await prisma.replyFetchQueue.createMany({
      data: map(messages, (message) => ({
        parentTs: message.ts,
        channel: backfillChannel.channel,
      })),
      skipDuplicates: true,
    });

    await prisma.backfillChannel.update({
      where: { channel: backfillChannel.channel },
      data: {
        completedAt: latestTs ? null : new Date(),
        latestTs,
      },
    });
  }

  const replyQueue = await prisma.replyFetchQueue.findMany({
    where: {
      completedAt: null,
    }
  });
  console.log(`${replyQueue.length} parent messages to backfill replies`);
  for (reply of replyQueue) {
    const messages = await fetchConversationReplies(reply.channel, reply.parentTs);
    console.log(`Fetched ${messages?.length} replies for ${reply.channel}`);
    if (!messages) break;
    const replies = filter(messages, (message) => reply.parentTs !== message.ts);
    await prisma.slackReply.createMany({
      data: map(replies, (r) => ({
        ts: r.ts,
        parentTs: reply.parentTs,
        data: r,
        updatedAt: new Date(),
      })),
      skipDuplicates: true,
    });

    await prisma.replyFetchQueue.update({
      where: { parentTs: reply.parentTs },
      data: {
        completedAt: new Date(),
      },
    });
  }

  setTimeout(main, 1000 * 60 * 10)
}

main();