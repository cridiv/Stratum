import TranscriptPage from "../Transcript";

interface TranscriptDetailRouteProps {
  params: Promise<{
    interviewId: string;
  }>;
}

export default async function TranscriptDetailRoutePage({
  params,
}: TranscriptDetailRouteProps) {
  const { interviewId } = await params;
  return <TranscriptPage interviewId={interviewId} />;
}
