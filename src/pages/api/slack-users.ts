
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next"
import { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "./auth/[...nextauth]"


export default async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    res.status(403).end();
    return;
  }

  const prisma = new PrismaClient();
  const slackUsers = await prisma.slackUser.findMany();

  res.status(200).json({ slackUsers });
};