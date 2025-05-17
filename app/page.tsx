"use client"; // This is a Client Component

import { useState, useEffect, useRef } from "react";
import Vapi from "@vapi-ai/web";
// Import CreateAssistantDTO from the correct path found earlier
// Adjust the import path if necessary based on your project structure
import { CreateAssistantDTO } from "@vapi-ai/web/dist/api";


// Define types for Vapi event messages (basic example, could be more specific)
interface VapiMessage {
    type: string;
    message: any; // 'any' for simplicity, you can refine based on Vapi docs
}

// Get the Vapi public key from environment variables
// Use a default empty string if not set, though in production you'd ensure it's set
const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "";

export default function VapiIntegration() {
    // State variables
    const [isCallActive, setIsCallActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState("Idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [messages, setMessages] = useState<VapiMessage[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [assistantId, setAssistantId] = useState<string>(""); // State for the input

    // Use useRef to keep the Vapi instance persistent across re-renders
    const vapiRef = useRef<Vapi | null>(null);

    // Initialize Vapi and set up event listeners on mount
    useEffect(() => {
        if (!publicKey) {
            setErrorMessage("Vapi Public Key not set in environment variables.");
            return;
        }

        // Initialize Vapi instance
        vapiRef.current = new Vapi(publicKey);
        const vapi = vapiRef.current;

        // --- Vapi Event Listeners ---

        // Call Start
        vapi.on("call-start", () => {
            setIsCallActive(true);
            setIsLoading(false);
            setStatus("Call Started");
            setErrorMessage(null); // Clear any previous errors
            setMessages([]); // Clear messages for a new call
            console.log("Call has started.");
        });

        // Call End
        vapi.on("call-end", () => {
            setIsCallActive(false);
            setIsLoading(false);
            setStatus("Call Ended");
            setErrorMessage(null);
            console.log("Call has ended.");
        });

        // Speech Start (Assistant)
        vapi.on("speech-start", () => {
            setStatus("Assistant Speaking");
            console.log("Assistant speech has started.");
        });

        // Speech End (Assistant)
        vapi.on("speech-end", () => {
            if (isCallActive) { // Only update status if call is still active
                setStatus("Listening..."); // Assuming default state after speaking
            }
            console.log("Assistant speech has ended.");
        });

        // Volume Level
        vapi.on("volume-level", (volume) => {
            setVolumeLevel(volume);
            // console.log(`Assistant volume level: ${volume}`); // Can be noisy
        });

        // Message (Transcripts, Function Calls, etc.)
        vapi.on("message", (message) => {
            console.log("Message received:", message);
            setMessages((prev) => [...prev, message]); // Add message to state
            // You would typically process 'message' here to display transcripts, handle function calls, etc.
            if (message.type === "transcript") {
                // Example: Update status or display transcript parts
                if (message.message.sender === "user") {
                    setStatus("User Speaking...");
                } else if (message.message.sender === "assistant" && status !== "Assistant Speaking") {
                    setStatus("Assistant Thinking..."); // Or similar state
                }
            } else if (message.type === "function-call") {
                setStatus(`Function Call: ${message.message.name}`);
            } else if (message.type === "function-return") {
                setStatus(`Function Returned: ${message.message.name}`);
            }
        });

        // Error Handling
        vapi.on("error", (e) => {
            setIsLoading(false);
            setErrorMessage(`Vapi Error: ${e.message || JSON.stringify(e)}`);
            setStatus("Error Occurred");
            console.error("Vapi Error:", e);
        });

        // COMMENTED OUT: Removing listener that caused the type error "Argument of type '"user-interrupted"' is not assignable..."
        // Please check Vapi Web SDK documentation or type definitions for the correct event name if needed.
        /*
        vapi.on("user-interrupted", () => {
            console.log("User interrupted assistant.");
            // Optional: Update status or perform action on interruption
        });
        */


        // --- Cleanup ---
        return () => {
            console.log("Cleaning up Vapi listeners...");
            // Remove all listeners or specific ones
            if (vapiRef.current) {
                vapiRef.current.removeAllListeners();
                // Optional: Stop the call if it's active when component unmounts
                if (isCallActive) {
                    vapiRef.current.stop();
                }
            }
            vapiRef.current = null; // Clear the ref
        };
        // Add status to dependencies if speech-end logic depends on it
    }, [isCallActive, publicKey, status]);


    // --- Handlers ---

    // This is the Vapi configuration OBJECT, typed as CreateAssistantDTO.
    // It is in "object form".
    // Based on previous errors, the structure for clientMessages and serverMessages
    // needs to match the exact definition in your installed Vapi SDK types.
    // The 'object[]' type is too generic. You must consult your SDK's
    // CreateAssistantDTO definition for the correct properties.
    // For now, leaving them as empty arrays as a placeholder.
    const simpleInlineAssistantConfig: CreateAssistantDTO = {
        model: {
            provider: "openai",
            model: "gpt-4o", // Or your preferred model
            temperature: 0.7,
            // The system instructions should be included as a message object in the messages array
            messages: [ // This array is required and contains the conversation history/instructions
                {
                    role: "system", // Role is 'system' for the system prompt
                    content: "You are a helpful assistant. Act as a girlfriend be sweet and polite." // The system instructions text
                }
                // Add other initial messages here if needed, e.g., role: "assistant", content: "Hello!"
            ]
        },
        voice: {
            provider: "azure",
            voiceId: "en-US-JennyNeural",
        },
        // clientMessages and serverMessages structure needs to be confirmed
        // from your Vapi SDK's CreateAssistantDTO type definition.
        // Placeholder empty arrays:
        clientMessages: [],
        serverMessages: [],
        name: "Simple Inline Assistant",
        firstMessage: "Hello! I am a simple inline assistant.",
        // Add any other necessary configuration fields here based on CreateAssistantDTO
        // Example:
        // endCallMessage: "Goodbye!",
        // functions: [] // If you have no functions, include an empty array
    };


    // Start Call Handler
    const handleStartCall = async () => {
        if (!vapiRef.current) {
            setErrorMessage("Vapi not initialized.");
            return;
        }
        // Check if neither an Assistant ID is entered nor the inline config exists
        // Since simpleInlineAssistantConfig is defined directly, we just check for assistantId.
        // This check should theoretically not be hit if simpleInlineAssistantConfig is always defined
        if (!assistantId && !simpleInlineAssistantConfig) {
            setErrorMessage("Configuration Error: No Assistant ID entered and inline configuration is missing.");
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        setStatus("Connecting...");

        try {
            // Use the correct union type string | CreateAssistantDTO for callConfig
            let callConfig: string | CreateAssistantDTO;

            if (assistantId) {
                // Use the provided Assistant ID
                callConfig = assistantId;
                console.log("Starting call with Assistant ID:", assistantId);
            } else {
                // Use the simple inline configuration object
                callConfig = simpleInlineAssistantConfig;
                console.log("Starting call with simple inline configuration.");
                // Request microphone permission when using inline config
                // This is required by browsers for getUserMedia if not initiated by a user gesture on audio
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (micError: any) {
                    console.error("Microphone permission denied:", micError);
                    setErrorMessage(`Microphone access needed to start call: ${micError.message}`);
                    setIsLoading(false);
                    setStatus("Permission Denied");
                    return; // Stop the function execution if permission is denied
                }
            }

            // Start the call using either the ID (string) or the inline config object (CreateAssistantDTO)
            const call = await vapiRef.current.start(callConfig);
            console.log("Vapi start successful, call object:", call);
            // State updates handled by 'call-start' event
        } catch (error: any) {
            console.error("Failed to start Vapi call:", error);
            setIsLoading(false);
            setStatus("Idle");
            setErrorMessage(`Failed to start call: ${error.message || JSON.stringify(error)}`);
        }
    };

    // Stop Call Handler
    const handleStopCall = () => {
        if (!vapiRef.current) return;
        setIsLoading(true);
        setStatus("Ending Call...");
        vapiRef.current.stop();
        // State updates handled by 'call-end' event
    };

    // Toggle Mute Handler
    const handleToggleMute = () => {
        if (!vapiRef.current) return;
        const currentlyMuted = vapiRef.current.isMuted();
        vapiRef.current.setMuted(!currentlyMuted);
        setIsMuted(!currentlyMuted);
        // Update status dynamically to show mute state
        setStatus(`Microphone: ${!currentlyMuted ? 'Muted' : 'Unmuted'}`);
        console.log(`Microphone ${!currentlyMuted ? 'muted' : 'unmuted'}`);
    };

    // Example: Send a background message
    const handleSendBackgroundMessage = () => {
        if (!vapiRef.current || !isCallActive) return;
        const messageToSend = {
            type: "add-message" as const, // Use 'as const' for literal type
            message: {
                role: "system" as const,
                content: "The user wants you to say 'Hello there!'."
            }
        };
        vapiRef.current.send(messageToSend);
        console.log("Sent background message.");
    };

    // Example: Use the say method
    // Note: This method sends a message for the assistant to say and can optionally end the call.
    const handleSayGoodbye = () => {
        if (!vapiRef.current || !isCallActive) return;
        // The second argument true tells the assistant to end the call after speaking this message
        vapiRef.current.say("Okay, goodbye!", true);
        console.log("Used say method to send 'Goodbye' and end call.");
        // The status will update to 'Ending Call...' via the 'call-end' event listener
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-sm sm:max-w-md lg:max-w-lg">
                <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-center text-gray-800">Vapi Web SDK Integration</h1>

                {/* Assistant ID Input */}
                <div className="mb-6">
                    <label htmlFor="assistantId" className="block text-gray-700 text-sm font-semibold mb-2">
                        Assistant ID (Leave blank to use inline config)
                    </label>
                    <input
                        type="text"
                        id="assistantId"
                        value={assistantId}
                        onChange={(e) => setAssistantId(e.target.value)}
                        className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                        placeholder="Enter Assistant ID (e.g., 79f3...ce48)"
                        disabled={isLoading || isCallActive} // Disable input if loading or call is active
                    />
                    {/* Clarify usage */}
                    <p className="text-xs text-gray-500 mt-1">
                        If the Assistant ID field is empty, the component will attempt to start the call using the `simpleInlineAssistantConfig` defined in the code.
                    </p>
                </div>


                {/* Control Buttons */}
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
                    {!isCallActive ? (
                        <button
                            onClick={handleStartCall}
                            // Disable if loading, no public key, and neither assistantId nor simpleInlineAssistantConfig exists
                            disabled={isLoading || !publicKey || (!assistantId && !simpleInlineAssistantConfig)}
                            className={`flex-1 font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isLoading || !publicKey || (!assistantId && !simpleInlineAssistantConfig)
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                                }`}
                        >
                            {isLoading ? "Connecting..." : "Start Call"}
                        </button>
                    ) : (
                        <button
                            onClick={handleStopCall}
                            disabled={isLoading}
                            className={`flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isLoading ? 'bg-red-400 cursor-not-allowed' : 'shadow-md hover:shadow-lg'}`}
                        >
                            {isLoading ? "Ending..." : "Stop Call"}
                        </button>
                    )}

                    {/* Mute Button (only shown when call is active) */}
                    {isCallActive && (
                        <button
                            onClick={handleToggleMute}
                            className={`flex-1 font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200
                                ${isMuted ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'} text-white shadow-md hover:shadow-lg`}
                        >
                            {isMuted ? "Unmute" : "Mute"}
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
                            Send Background Msg
                        </button>
                        <button
                            onClick={handleSayGoodbye}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg text-sm focus:outline-none focus:shadow-outline transition duration-200 shadow-md hover:shadow-lg"
                        >
                            Say & End
                        </button>
                    </div>
                )}


                {/* Status Display */}
                <div className="mb-6 text-center">
                    <p className="text-gray-800 text-lg font-medium">Status: <span className="font-semibold text-blue-700">{status}</span></p>
                    {isCallActive && (
                        <p className="text-gray-600 text-sm mt-1">Volume: {volumeLevel.toFixed(2)}</p>
                    )}
                    {errorMessage && (
                        <p className="text-red-600 text-sm mt-2 font-medium">{errorMessage}</p>
                    )}
                </div>

                {/* Messages Log */}
                <div className="mt-6">
                    <h2 className="text-xl font-semibold mb-3 text-gray-800">Messages Log:</h2>
                    <div className="bg-gray-100 p-4 rounded-lg h-48 overflow-y-auto text-sm border border-gray-300">
                        {messages.length === 0 ? (
                            <p className="text-gray-500 italic">No messages yet...</p>
                        ) : (
                            messages.map((msg, index) => (
                                <pre key={index} className="whitespace-pre-wrap break-words border-b border-gray-300 pb-3 mb-3 last:border-b-0 text-gray-700">
                                    {/* Basic formatting for different message types */}
                                    {msg.type === 'transcript' ?
                                        `${msg.message.sender === 'user' ? 'User' : 'Assistant'}: ${msg.message.text}`
                                        :
                                        JSON.stringify(msg, null, 2)
                                    }
                                </pre>
                            ))
                        )}
                    </div>
                </div>

            </div>
            {/* Add note about PublicKey */}
            {!publicKey && (
                <p className="text-center text-red-600 mt-4 text-sm font-medium">
                    Vapi Public Key is not set in environment variables. Please set NEXT_PUBLIC_VAPI_PUBLIC_KEY.
                </p>
            )}
        </div>
    );
}
