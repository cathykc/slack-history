import { useSession, signIn } from "next-auth/react"
import { useEffect, useState } from "react";
import { concat, filter, includes, isEmpty, keyBy, map, reverse, sortBy, uniqBy } from "lodash";
import { useRouter } from 'next/router'
// import { renderSlackText } from "../helpers/render";


const SlackMessage = ({ slackMessage, slackUsersMap, slackConversationsMap }: { slackMessage: any, slackUsersMap: { [id: string]: any }, slackConversationsMap: { [id: string]: any } }) => {
  const [threadExpanded, setThreadExpanded] = useState(false);
  
  const sender = slackUsersMap[slackMessage.data.user];

  const replies = sortBy(filter(slackMessage.slackReplies, (r) => r.ts !== slackMessage.ts), "ts");
  return (
    <div className="flex items-start mb-4">
      <img src={sender?.data?.profile?.image_72} className="w-8 h-8 mr-2 rounded"/>
      <div>
        <div className="flex items-center font-medium">{sender?.data?.real_name}</div>
        <div className="text-sm break-words">{slackMessage.data.text}</div>
        {!!slackMessage.data.files?.length && <div className="flex flex-wrap">{
          map(slackMessage.data.files, (file) => {
          return <a className="text-blue-500 text-xs cursor-pointer hover:underline mr-2" key={file.id} target="_blank" href={file.url_private}>{file.name}</a>
        })}</div>}
        {!!replies.length && <div className="mt-2">
          {threadExpanded ? (<div className="mt-2">
            {map(replies, (reply) => {
              const replySender = slackUsersMap[reply.data.user];
              return <div className="flex items-start mb-2">
                <img src={replySender?.data?.profile?.image_72} className="w-8 h-8 mr-2 rounded"/>
                <div>
                  <div className="flex items-center font-medium">{replySender?.data?.real_name}</div>
                  <div key={reply.ts} className="text-sm break-words">{reply.data.text}</div>
                  {!!reply.data.files?.length && <div className="flex flex-wrap">{
                    map(reply.data.files, (file) => {
                    return <a className="text-blue-500 text-xs cursor-pointer hover:underline mr-2" key={file.id} target="_blank" href={file.url_private}>{file.name}</a>
                  })}</div>}
                </div>
              </div>
            })}
          </div>) : (
            <div className="text-xs cursor-pointer hover:text-purple-600" onClick={() => setThreadExpanded(true)}>{replies.length} replies</div>
          )}
        </div>}
       
      </div>
    </div>
  )
  // return (<div>{
  //   renderSlackText(
  //     slackMessage.data.text,
  //     slackMessage.data.blocks,
  //     [],
  //     slackUsersMap,
  //     slackConversationsMap,
  //   )
  // }</div>)
  
  // text: string,
  // blocks: SlackMessageBlock[] | null,
  // slackEmojis: Array<CustomSlackEmoji>,
  // slackUsersByIDMap: { [key: string]: SlackUser },
  // slackConversationsByIDMap: { [key: string]: SlackConversation[] },
  // onChannelClick?: (channelID: string) => void,
  // defaultOptions: {
  //   shouldStripBlockFormatting?: boolean;
  //   shouldRenderRawEmojiKey?: boolean;
  //   grayscale?: boolean;
  // } = {
  //   shouldStripBlockFormatting: false,
  //   shouldRenderRawEmojiKey: false,
  //   grayscale: false,
  // },

  return <div>{JSON.stringify(slackMessage)}</div>
}

export default function Home() {
  const router = useRouter()
  const { data: session } = useSession();

  const [messages, setMessages] = useState<any[]>([]);
  const [conversationsMap, setConversationsMap] = useState<{[id: string]: any}>({});
  const [usersMap, setUsersMap] = useState({});
  const [initialMessagesLoading, setInitialMessagesLoading] = useState(false);

  useEffect(() => {
    if (!session) return;

    const fetchSlackUsers = async () => {
      const response = await fetch("/api/slack-users");
      if (response.status === 200) {
        const { slackUsers }  = await response.json();
        setUsersMap(keyBy(slackUsers, "id"));
      }
    }

    const fetchSlackConversations = async () => {
      const response = await fetch("/api/slack-conversations");
      if (response.status === 200) {
        const { slackConversations }  = await response.json();
        setConversationsMap(keyBy(slackConversations, "id"));
      }
    }

    fetchSlackUsers();
    fetchSlackConversations();
  }, [session]);

  const fetchMessages = async (channel: string) => {
    const response = await fetch(`/api/slack-messages?channel=${channel}`);
    if (response.status === 200) {
      const { slackMessages }  = await response.json();
      setMessages((prevMessages) => reverse(sortBy(uniqBy(concat(prevMessages, slackMessages), (m: any) => m.ts), "ts")));
    }
    setInitialMessagesLoading(false);
  }

  useEffect(() => {
    if (isEmpty(conversationsMap)) return;

    setMessages([]);

    setInitialMessagesLoading(true);
    fetchMessages(router.query.channel as string);
  }, [router.query.channel, conversationsMap])
  
  if (!session) {
    return (
      <>
        Not signed in <br />
        <button onClick={() => signIn()}>Sign in</button>
      </>
    )
  }

  const currentChannel = router.query.channel as string;

  const channelLink = () => {
    if (!conversationsMap[currentChannel]) return <span />
    return <div className="flex justify-center py-4 text-sm">Go to <a className="text-purple-600 cursor-pointer hover:underline ml-1" href={`https://alamouse.slack.com/archives/${currentChannel}`} target="_blank">#{conversationsMap[currentChannel].data.name}</a></div>;
  }
  
  return (<div className="flex text-gray-700 h-screen">
    <div className="shrink-0 mr-6 overflow-y-scroll overscroll-none px-6 py-4 ">
      {map(sortBy(Object.entries(conversationsMap), ([_id, obj]) => includes(obj.data.name, "chat-") ? "a" : obj.data.name ), ([conversationId, conversation]: [string, any]) => {
        return <div className={`cursor-pointer hover:bg-purple-100 px-2 py-1 my-1 rounded ${conversationId === router.query.channel && "bg-purple-200"}`} key={conversationId} onClick={() => router.push(`/?channel=${conversationId}`)}>{includes(conversation.data.name, "chat-") ? "📌" : "#"} {conversation.data.name}</div>
      })}
    </div>
    {initialMessagesLoading ? <div className="animate-pulse px-6 py-4">Loading...</div> : (<>
      <div key={currentChannel} className="flex overflow-y-scroll overflow-hidden overscroll-none flex-col-reverse px-6 py-4">
        {channelLink()}
        {map(messages, (message) => <SlackMessage key={message.ts} slackMessage={message} slackUsersMap={usersMap} slackConversationsMap={conversationsMap} />)}
        {channelLink()}
      </div>
    </>)}
  </div>);
  
}