import StartScreen from "@/components/StartScreen";

/**
 * The start screen: pick a wallet, pick a replay, and go.
 *
 * The route is a shell. Everything it does lives in `StartScreen`, which is a
 * client component — the reel, the wallet and the music all need the browser.
 */
export default function Home() {
  return <StartScreen />;
}
