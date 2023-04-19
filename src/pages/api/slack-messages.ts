import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next"
import { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "./auth/[...nextauth]"

const prisma = new PrismaClient();

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    res.status(403).end();
    return;
  }

  const slackMessages = await prisma.slackMessage.findMany({
    where: {
      channel: req.query.channel as string,
    }, 
    include: {
      slackReplies: true,
    }
  });

  res.status(200).json({ slackMessages });
};