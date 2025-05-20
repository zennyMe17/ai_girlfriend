
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { CreateAssistantDTO } from "@vapi-ai/web/dist/api";

const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "";

export default function VapiInterviewBot() {
    const [isCallActive, setIsCallActive] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [status, setStatus] = useState<string>("Ready for Interview");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [volumeLevel, setVolumeLevel] = useState<number>(0);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [assistantId, setAssistantId] = useState<string>("");

    const [interviewScore, setInterviewScore] = useState<string | null>(null);
    const [isScoring, setIsScoring] = useState<boolean>(false);

    const vapiRef = useRef<Vapi | null>(null);
    const isCallActiveRef = useRef<boolean>(isCallActive);

    // This ref will hold the latest call ID directly
    const currentCallIdRef = useRef<string | null>(null);

    // Effect to keep the ref updated with the latest isCallActive state
    useEffect(() => {
        isCallActiveRef.current = isCallActive;
    }, [isCallActive]);


    const scoreInterviewTranscript = useCallback(async (callId: string) => {
        setIsScoring(true);
        setInterviewScore("Generating score...");
        console.log(`Starting interview scoring for Call ID: ${callId}`);

        try {
            const response = await fetch('/api/score-interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ callId: callId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setInterviewScore(data.score);
            console.log(`Interview score generated for ${callId}:`, data.score);
        } catch (error: any) {
            console.error(`Error scoring interview for Call ID ${callId}:`, error);
            setInterviewScore(`Failed to generate score: ${error.message}`);
        } finally {
            setIsScoring(false);
        }
    }, []);


    const handleCallEnd = useCallback(() => {
        setIsCallActive(false);
        setIsLoading(false);
        setStatus("Interview Ended");
        setErrorMessage(null);
        console.log("Vapi Event: Call has ended.");

        // IMPORTANT DEBUG: Check the value of the ref right before scoring
        console.log("DEBUG: currentCallIdRef.current at call-end:", currentCallIdRef.current);

        if (currentCallIdRef.current) {
            scoreInterviewTranscript(currentCallIdRef.current);
            // Optionally, clear the ref after use if you want to explicitly reset it for the next call
            currentCallIdRef.current = null;
        } else {
            setInterviewScore("No call ID available to score. (Ref was null at call end)");
            setIsScoring(false);
            console.error("Error: currentCallIdRef.current was null when handleCallEnd fired.");
        }
    }, [scoreInterviewTranscript]);


    // Main useEffect for Vapi initialization and event listeners
    useEffect(() => {
        if (!publicKey) {
            setErrorMessage("Vapi Public Key not set in environment variables.");
            return;
        }

        if (!vapiRef.current) {
            vapiRef.current = new Vapi(publicKey);
            console.log("Vapi instance initialized.");
        }
        const vapi = vapiRef.current;

        const handleCallStart = () => {
            setIsCallActive(true);
            setIsLoading(false);
            setStatus("Interview Started");
            setErrorMessage(null);
            currentCallIdRef.current = null; // Clear ref on start of a new call
            setInterviewScore(null); // Clear previous score on start
            console.log("Vapi Event: Call has started.");
        };

        const handleSpeechStart = () => {
            setStatus("Interviewer Speaking");
            console.log("Vapi Event: Interviewer speech has started.");
        };

        const handleSpeechEnd = () => {
            setIsCallActive((currentIsActive) => {
                if (currentIsActive) {
                    setStatus("Listening to Candidate...");
                }
                return currentIsActive;
            });
            console.log("Vapi Event: Interviewer speech has ended.");
        };

        const handleVolumeLevel = (volume: number) => {
            setVolumeLevel(volume);
        };

        const handleError = (e: Error) => {
            setIsLoading(false);
            setErrorMessage(`Vapi Error: ${e.message || JSON.stringify(e)}`);
            setStatus("Error During Interview");
            console.error("Vapi Event: Error:", e);
        };

        // Attach listeners
        vapi.on("call-start", handleCallStart);
        vapi.on("call-end", handleCallEnd);
        vapi.on("speech-start", handleSpeechStart);
        vapi.on("speech-end", handleSpeechEnd);
        vapi.on("volume-level", handleVolumeLevel);
        vapi.on("error", handleError);

        // --- Cleanup Function ---
        return () => {
            console.log("Cleaning up Vapi listeners during component unmount or publicKey/handleCallEnd change.");
            if (vapiRef.current) {
                vapiRef.current.off("call-start", handleCallStart);
                vapiRef.current.off("call-end", handleCallEnd);
                vapiRef.current.off("speech-start", handleSpeechStart);
                vapiRef.current.off("speech-end", handleSpeechEnd);
                vapiRef.current.off("volume-level", handleVolumeLevel);
                vapiRef.current.off("error", handleError);

                if (isCallActiveRef.current) {
                    console.log("Stopping active Vapi call during cleanup.");
                    vapiRef.current.stop();
                }
            }
        };
    }, [publicKey, handleCallEnd]);


    // --- Assistant Configuration (no changes) ---
    const interviewAssistantConfig: CreateAssistantDTO = {
        model: {
            provider: "openai",
            model: "gpt-4o",
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: "You are a professional and polite AI interviewer named Nexus AI. Your goal is to conduct a structured job interview. Start by welcoming the candidate and asking them to introduce themselves. Then, ask relevant behavioral and technical questions, one at a time. Maintain a neutral, encouraging and respectful tone. Do not interrupt the candidate. If the conversation goes off-topic or the user uses inappropriate language, gently steer them back by saying: 'Let's bring our focus back to the interview, shall we?' Ensure a smooth and professional interview experience. Conclude the interview politely when appropriate, for example, after asking 3-5 questions or if the user indicates they are done."
                }
            ]
        },
        voice: {
            provider: "azure",
            voiceId: "en-US-JennyNeural",
        },
        clientMessages: [],
        serverMessages: [],
        name: "Nexus AI Interviewer",
        firstMessage: "Welcome! I'm Nexus AI. Please introduce yourself and tell me a bit about your background.",
    };


    // --- Handlers (handleStartCall updated) ---
    const handleStartCall = async () => {
        if (!vapiRef.current) {
            setErrorMessage("Vapi not initialized. Please refresh or check public key.");
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        setStatus("Initiating Interview...");
        currentCallIdRef.current = null; // Ensure ref is cleared before new call
        setInterviewScore(null);

        try {
            let callConfig: string | CreateAssistantDTO;

            if (assistantId) {
                callConfig = assistantId;
                console.log("Attempting to start call with Assistant ID:", assistantId);
            } else {
                callConfig = interviewAssistantConfig;
                console.log("Attempting to start call with inline configuration.");

                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log("Microphone permission granted.");
                } catch (micError: any) {
                    console.error("Microphone permission denied:", micError);
                    setErrorMessage(`Microphone access needed to start interview: ${micError.message || "Permission denied."}`);
                    setIsLoading(false);
                    setStatus("Permission Denied");
                    return;
                }
            }

            const call = await vapiRef.current.start(callConfig);

            if (call) {
                // *** THIS IS THE NEW LOG YOU ASKED FOR ***
                console.log(">>> RAW CALL.ID FROM VAPI.START():", call.id);

                // Directly set the ref with the call ID
                currentCallIdRef.current = call.id;
                console.log("Vapi start successful, call object:", call);
                console.log("Call ID captured DIRECTLY IN REF:", currentCallIdRef.current);
                console.log("CONFIRM: currentCallIdRef.current immediately after setting:", currentCallIdRef.current);
            } else {
                console.error("Vapi start returned null. Call could not be initiated.");
                setErrorMessage("Failed to start call: Vapi did not return a call object.");
                setIsLoading(false);
                setStatus("Ready for Interview");
            }

        } catch (error: any) {
            console.error("Failed to start Vapi interview:", error);
            setIsLoading(false);
            setStatus("Ready for Interview");
            setErrorMessage(`Failed to start interview: ${error.message || "An unknown error occurred."}`);
        }
    };

    const handleStopCall = () => {
        if (!vapiRef.current) return;
        setIsLoading(true);
        setStatus("Ending Interview...");
        vapiRef.current.stop();
    };

    const handleToggleMute = () => {
        if (!vapiRef.current) return;
        const currentlyMuted = vapiRef.current.isMuted();
        vapiRef.current.setMuted(!currentlyMuted);
        setIsMuted(!currentlyMuted);
        setStatus(`Microphone: ${!currentlyMuted ? 'Muted' : 'Unmuted'}`);
        console.log(`Microphone ${!currentlyMuted ? 'muted' : 'unmuted'}`);
    };

    const handleSendBackgroundMessage = () => {
        if (!vapiRef.current || !isCallActive) {
            setErrorMessage("Call not active to send message.");
            return;
        }
        const messageToSend = {
            type: "add-message" as const,
            message: {
                role: "system" as const,
                content: "Please ask the candidate about their biggest professional achievement."
            }
        };
        vapiRef.current.send(messageToSend);
        console.log("Sent background prompt to interviewer.");
    };

    const handleSayGoodbye = () => {
        if (!vapiRef.current || !isCallActive) {
            setErrorMessage("Call not active to say goodbye.");
            return;
        }
        vapiRef.current.say("Thank you for your time. We will be in touch shortly. Goodbye!", true);
        console.log("Used say method to send 'Goodbye' and end interview.");
    };


    // --- Rendered UI (no changes) ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg relative">
                <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-center text-gray-800">AI Interview Bot</h1>

                {/* Bot Avatar */}
                <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shadow-lg border-4 border-white">
                        <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 12a1 1 0 01-1 1H4a1 1 0 01-1-1v-1a4 4 0 014-4h10a4 4 0 014 4v1z"></path>
                        </svg>
                    </div>
                </div>
                {/* Spacer to push content down due to avatar */}
                <div className="mt-8"></div>


                {/* Assistant ID Input */}
                <div className="mb-6">
                    <label htmlFor="assistantId" className="block text-gray-700 text-sm font-semibold mb-2">
                        Assistant ID (Leave blank for Interviewer bot)
                    </label>
                    <input
                        type="text"
                        id="assistantId"
                        value={assistantId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssistantId(e.target.value)}
                        className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                        placeholder="Enter Vapi Assistant ID (e.g., 79f3...ce48)"
                        disabled={isLoading || isCallActive}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        If empty, the component will use the default `Nexus AI Interviewer` configuration defined in this file.
                    </p>
                </div>


                {/* Control Buttons */}
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
                    {!isCallActive ? (
                        <button
                            onClick={handleStartCall}
                            disabled={isLoading || !publicKey || (!assistantId && !interviewAssistantConfig)}
                            className={`flex-1 font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isLoading || !publicKey || (!assistantId && !interviewAssistantConfig)
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
                                }`}
                        >
                            {isLoading ? "Starting Interview..." : "Start Interview"}
                        </button>
                    ) : (
                        <button
                            onClick={handleStopCall}
                            disabled={isLoading}
                            className={`flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isLoading ? 'bg-red-400 cursor-not-allowed' : 'shadow-md hover:shadow-lg'}`}
                        >
                            {isCallActive ? "End Interview" : "Interview Ended"}
                        </button>
                    )}

                    {isCallActive && (
                        <button
                            onClick={handleToggleMute}
                            className={`flex-1 font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isMuted ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white shadow-md hover:shadow-lg`}
                        >
                            {isMuted ? "Unmute Mic" : "Mute Mic"}
                        </button>
                    )}
                </div>

                {/* Additional Interaction Buttons (only shown when call is active) */}
                {isCallActive && (
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
                        <button
                            onClick={handleSendBackgroundMessage}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg text-sm focus:outline-none focus:shadow-outline transition duration-200 shadow-md hover:shadow-lg"
                        >
                            Prompt Next Question
                        </button>
                        <button
                            onClick={handleSayGoodbye}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg text-sm focus:outline-none focus:shadow-outline transition duration-200 shadow-md hover:shadow-lg"
                        >
                            Say Thanks & End
                        </button>
                    </div>
                )}


                {/* Status Display */}
                <div className="mb-6 text-center">
                    <p className="text-gray-800 text-lg font-medium">Status: <span className="font-semibold text-blue-700">{status}</span></p>
                    {isCallActive && (
                        <p className="text-gray-600 text-sm mt-1">Interviewer Volume: {volumeLevel.toFixed(2)}</p>
                    )}
                    {errorMessage && (
                        <p className="text-red-600 text-sm mt-2 font-medium">{errorMessage}</p>
                    )}
                </div>

                {/* Interview Score Display */}
                {!isCallActive && (interviewScore || isScoring) && (
                    <div className="mt-6 text-center bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-inner">
                        <h2 className="text-xl font-semibold mb-2 text-blue-800">Interview Score:</h2>
                        {isScoring ? (
                            <p className="text-blue-600 animate-pulse">Generating score...</p>
                        ) : (
                            <p className="text-blue-700 font-medium whitespace-pre-wrap">{interviewScore}</p>
                        )}
                    </div>
                )}

            </div>
            {/* Add note about PublicKey */}
            {!publicKey && (
                <p className="text-center text-red-600 mt-4 text-sm font-medium">
                    Vapi Public Key is not set in environment variables. Please set `NEXT_PUBLIC_VAPI_PUBLIC_KEY`.
                </p>
            )}
        </div>
    );
}



