"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { generatePresentationImages } from '@/ai/flows/generate-presentation-images';
import type { ProvidePresentationFeedbackOutput } from '@/ai/flows/provide-presentation-feedback';
import { providePresentationFeedback } from '@/ai/flows/provide-presentation-feedback';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Mic, StopCircle, Lightbulb, Clock, Target, Award, Play, RotateCcw, Eye, MicOff } from 'lucide-react';

type AppStage = "idle" | "generatingImages" | "countdown" | "slideshow" | "fetchingFeedback" | "showFeedback";

const SLIDE_DURATION_MS = 3000;
const COUNTDOWN_START = 3;

export default function ImpromptuPresenterPage() {
  const [topic, setTopic] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_START);
  const [feedback, setFeedback] = useState<ProvidePresentationFeedbackOutput | null>(null);
  const [stage, setStage] = useState<AppStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [slideProgress, setSlideProgress] = useState(0);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const slideshowTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const slideProgressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const resetState = useCallback(() => {
    setTopic("");
    setImages([]);
    setCurrentSlideIndex(0);
    setCountdownValue(COUNTDOWN_START);
    setFeedback(null);
    setError(null);
    setStage("idle");
    setAudioUnavailable(false);
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (slideProgressTimerRef.current) clearInterval(slideProgressTimerRef.current);
    setSlideProgress(0);
  }, []);

  const handleTopicSubmit = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }
    setError(null);
    setAudioUnavailable(false); // Reset audio unavailability status
    setStage("generatingImages");
    try {
      const result = await generatePresentationImages({ topic });
      if (result && result.image1 && result.image2 && result.image3) {
        setImages([result.image1, result.image2, result.image3]);
        setStage("countdown");
      } else {
        throw new Error("Failed to generate images or received invalid response.");
      }
    } catch (err) {
      console.error("Image generation error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during image generation.";
      setError(`Failed to generate images: ${errorMessage}`);
      setStage("idle");
      toast({ title: "Error", description: `Image generation failed: ${errorMessage}`, variant: "destructive" });
    }
  };

  const startRecording = async (): Promise<boolean> => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstop = () => { // Basic cleanup
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      return true;
    } catch (err) {
      console.error("Microphone access error:", err);
      const toastMessage = err instanceof Error && err.name === "NotAllowedError"
        ? "Microphone permission denied. Proceeding without audio recording for feedback."
        : "Could not access microphone. Proceeding without audio recording for feedback.";
      toast({
        title: "Microphone Unavailable",
        description: toastMessage,
        variant: "default"
      });
      return false;
    }
  };

  const stopRecordingAndGetFeedback = async () => {
    if (audioUnavailable) {
      toast({
        title: "No Audio Input",
        description: "Microphone was unavailable or permission denied. Presentation feedback is skipped.",
        variant: "default",
      });
      setFeedback({
        clarityFeedback: "N/A (microphone unavailable or permission denied)",
        pacingFeedback: "N/A (microphone unavailable or permission denied)",
        contentRelevanceFeedback: "N/A (microphone unavailable or permission denied)",
        overallFeedback: "Presentation completed. Audio feedback skipped as microphone was not available or permission was denied.",
      });
      setStage("showFeedback");
      return;
    }

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
      toast({
        title: "Recording Issue",
        description: "Audio recording was not active or properly initialized. Feedback skipped.",
        variant: "default"
      });
      setFeedback({
        clarityFeedback: "N/A (recording issue)",
        pacingFeedback: "N/A (recording issue)",
        contentRelevanceFeedback: "N/A (recording issue)",
        overallFeedback: "Presentation completed. Feedback skipped due to a recording issue.",
      });
      setStage("showFeedback");
      return;
    }
    
    setStage("fetchingFeedback");
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      if (audioBlob.size === 0) {
        toast({ title: "Warning", description: "No audio was captured during recording. Feedback may be limited or unavailable.", variant: "default" });
        setFeedback({
          clarityFeedback: "N/A (no audio captured)",
          pacingFeedback: "N/A (no audio captured)",
          contentRelevanceFeedback: "N/A (no audio captured)",
          overallFeedback: "No audio was captured during the recording.",
        });
        setStage("showFeedback");
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        try {
          const feedbackResult = await providePresentationFeedback({ audioDataUri: base64Audio, topic });
          setFeedback(feedbackResult);
        } catch (err) {
          console.error("Feedback generation error:", err);
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during feedback generation.";
          toast({ title: "Error", description: `Feedback generation failed: ${errorMessage}`, variant: "destructive" });
          setFeedback({
              clarityFeedback: "Error fetching feedback.",
              pacingFeedback: "Error fetching feedback.",
              contentRelevanceFeedback: "Error fetching feedback.",
              overallFeedback: "Error fetching feedback.",
          });
        } finally {
          setStage("showFeedback");
        }
      };
      reader.onerror = () => {
        console.error("FileReader error");
        toast({ title: "Error", description: "Failed to process recorded audio.", variant: "destructive" });
        setFeedback({
            clarityFeedback: "Error processing audio.",
            pacingFeedback: "Error processing audio.",
            contentRelevanceFeedback: "Error processing audio.",
            overallFeedback: "Error processing audio.",
        });
        setStage("showFeedback");
      };
      // Clean up media stream tracks associated with this specific recorder instance
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorderRef.current.stop();
  };

  useEffect(() => {
    if (stage === "countdown" && countdownValue > 0) {
      countdownTimerRef.current = setTimeout(() => setCountdownValue(countdownValue - 1), 1000);
    } else if (stage === "countdown" && countdownValue === 0) {
      (async () => {
        setError(null); 
        const recordingSuccessfullyInitiated = await startRecording();
        setAudioUnavailable(!recordingSuccessfullyInitiated);
        setStage("slideshow");
        setCurrentSlideIndex(0);
      })();
    }
    return () => { if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current); };
  }, [stage, countdownValue]);

  useEffect(() => {
    if (stage === "slideshow") {
      setSlideProgress(0); 
      
      let progressIntervalStart = Date.now();
      if(slideProgressTimerRef.current) clearInterval(slideProgressTimerRef.current);
      slideProgressTimerRef.current = setInterval(() => {
        const elapsedTime = Date.now() - progressIntervalStart;
        const progress = Math.min(100, (elapsedTime / SLIDE_DURATION_MS) * 100);
        setSlideProgress(progress);
        if (progress >= 100) {
          if(slideProgressTimerRef.current) clearInterval(slideProgressTimerRef.current);
        }
      }, 100);

      if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
      slideshowTimerRef.current = setTimeout(() => {
        if (currentSlideIndex < images.length - 1) {
          setCurrentSlideIndex(prevIndex => prevIndex + 1);
        } else {
          stopRecordingAndGetFeedback();
        }
      }, SLIDE_DURATION_MS);
    }
    return () => {
      if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
      if (slideProgressTimerRef.current) clearInterval(slideProgressTimerRef.current);
    };
  }, [stage, currentSlideIndex, images.length, audioUnavailable]); // Added audioUnavailable in case stopRecordingAndGetFeedback behavior changes based on it


  const renderContent = () => {
    switch (stage) {
      case "idle":
        return (
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Presentation Topic</CardTitle>
              <CardDescription className="text-center">Enter a topic for your impromptu presentation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic</Label>
                  <Input
                    id="topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., The Future of AI"
                    className="text-base"
                  />
                </div>
                <Button onClick={handleTopicSubmit} className="w-full" size="lg">
                  <Play className="mr-2 h-5 w-5" /> Start Presentation
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      case "generatingImages":
        return (
          <div className="flex flex-col items-center space-y-4 p-8 rounded-lg bg-card shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-xl text-card-foreground">Generating images for "{topic}"...</p>
            <p className="text-muted-foreground">This might take a moment.</p>
          </div>
        );
      case "countdown":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 p-8 rounded-lg bg-card shadow-xl min-h-[300px]">
            <p className="text-muted-foreground text-2xl">Get Ready!</p>
            <p className="text-9xl font-bold text-primary">{countdownValue}</p>
            <Mic className="h-10 w-10 text-primary animate-pulse"/>
            <p className="text-muted-foreground">Microphone will attempt to start recording.</p>
          </div>
        );
      case "slideshow":
        return (
          <Card className="w-full max-w-3xl shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/50 p-4">
              <CardTitle className="text-xl flex items-center justify-between">
                <span>Topic: {topic}</span>
                <span className="text-sm font-normal text-muted-foreground">Slide {currentSlideIndex + 1} of {images.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 relative aspect-video flex items-center justify-center bg-black">
              {images.length > 0 && images[currentSlideIndex] && (
                <Image
                  src={images[currentSlideIndex]}
                  alt={`Slide ${currentSlideIndex + 1} for topic: ${topic}`}
                  layout="fill"
                  objectFit="contain"
                  priority={currentSlideIndex === 0}
                  className="transition-opacity duration-500 ease-in-out opacity-100"
                  data-ai-hint="presentation slide"
                />
              )}
            </CardContent>
            <div className="p-2 bg-muted/50">
              <Progress value={slideProgress} className="w-full h-2 [&>div]:bg-accent" />
            </div>
            <div className="p-4 flex items-center justify-center text-muted-foreground">
              { !audioUnavailable ? (
                <>
                  <Mic className="h-5 w-5 mr-2 text-red-500 animate-pulse" /> Recording in progress...
                </>
              ) : (
                <>
                  <MicOff className="h-5 w-5 mr-2" /> Microphone unavailable. No audio recording.
                </>
              )}
            </div>
          </Card>
        );
      case "fetchingFeedback":
        return (
          <div className="flex flex-col items-center space-y-4 p-8 rounded-lg bg-card shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-xl text-card-foreground">Analyzing your presentation...</p>
            <p className="text-muted-foreground">AI is preparing your feedback.</p>
          </div>
        );
      case "showFeedback":
        return (
          <div className="w-full max-w-2xl space-y-6">
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle className="text-3xl text-center">Presentation Feedback</CardTitle>
                <CardDescription className="text-center">Here's how you did on "{topic}":</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {feedback ? (
                  <>
                    <FeedbackItem icon={<Lightbulb className="text-accent"/>} title="Clarity" content={feedback.clarityFeedback} />
                    <FeedbackItem icon={<Clock className="text-accent"/>} title="Pacing" content={feedback.pacingFeedback} />
                    <FeedbackItem icon={<Target className="text-accent"/>} title="Content Relevance" content={feedback.contentRelevanceFeedback} />
                    <FeedbackItem icon={<Award className="text-accent"/>} title="Overall Feedback" content={feedback.overallFeedback} />
                  </>
                ) : (
                  <p className="text-center text-muted-foreground">No feedback available.</p>
                )}
              </CardContent>
            </Card>
            <Button onClick={resetState} className="w-full" size="lg">
              <RotateCcw className="mr-2 h-5 w-5" /> Start New Presentation
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-8 bg-background">
      <header className="text-center">
        <div className="inline-block p-1 rounded-lg bg-accent shadow-lg">
            <div className="bg-card px-6 py-3 rounded-md">
                 <h1 className="text-5xl font-bold text-accent flex items-center">
                    <Eye className="mr-3 h-12 w-12"/>ImpromptuPresenter
                </h1>
            </div>
        </div>
        <p className="text-muted-foreground mt-3 text-lg">Generate a presentation on the fly and get AI feedback!</p>
      </header>

      {error && (
        <Alert variant="destructive" className="w-full max-w-md mb-6 shadow-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <main className="w-full flex justify-center">
        {renderContent()}
      </main>

      <footer className="text-center text-sm text-muted-foreground mt-auto py-4">
        Powered by AI. Presentation skills matter.
      </footer>
    </div>
  );
}

interface FeedbackItemProps {
  icon: React.ReactNode;
  title: string;
  content: string;
}

function FeedbackItem({ icon, title, content }: FeedbackItemProps) {
  return (
    <Card className="bg-muted/30">
      <CardHeader className="flex flex-row items-center space-x-3 pb-2">
        <span className="p-2 bg-accent/20 rounded-full">{icon}</span>
        <CardTitle className="text-xl text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground">{content}</p>
      </CardContent>
    </Card>
  );
}
