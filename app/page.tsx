"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, ArrowRight, Menu, X } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Team {
  id: number
  name: string
  color: string
}

interface GameWord {
  id: number
  word: string
  points: number
}

interface GameScore {
  team_id: number
  points: number
}

export default function HangmanGame() {
  const [teams, setTeams] = useState<Team[]>([])
  const [words, setWords] = useState<GameWord[]>([])
  const [gameScores, setGameScores] = useState<GameScore[]>([])
  const [currentGameId, setCurrentGameId] = useState<number | null>(null)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentTeam, setCurrentTeam] = useState(0)
  const [originalTeamForQuestion, setOriginalTeamForQuestion] = useState(0) // Track which team this question belongs to
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [revealedPositions, setRevealedPositions] = useState<number[]>([]) // Track which positions are revealed
  const [defaultRevealedPositions, setDefaultRevealedPositions] = useState<number[]>([]) // Default revealed letters
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [gameState, setGameState] = useState<"playing" | "won" | "lost" | "finished" | "loading">("loading")
  const [inputLetter, setInputLetter] = useState("")
  const [teamsAttempted, setTeamsAttempted] = useState<number[]>([])
  const [isPassedQuestion, setIsPassedQuestion] = useState(false)

  const [wordError, setWordError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [setupProgress, setSetupProgress] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showRoundStartLeaderboard, setShowRoundStartLeaderboard] = useState(false)

  const currentGameWord = words[currentWordIndex]
  const maxWrongGuesses = 4

  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [])

  // Generate default revealed positions when word changes
  useEffect(() => {
    if (currentGameWord) {
      generateDefaultRevealedPositions()
    }
  }, [currentWordIndex, currentGameWord])

  const generateDefaultRevealedPositions = () => {
    if (!currentGameWord) return

    const wordLength = currentGameWord.word.length
    const numToReveal = Math.min(4, Math.floor(wordLength * 0.3)) // Reveal 2-3 letters or 30% of word
    const positions: number[] = []

    // Randomly select positions to reveal
    while (positions.length < numToReveal) {
      const randomPos = Math.floor(Math.random() * wordLength)
      if (!positions.includes(randomPos)) {
        positions.push(randomPos)
      }
    }

    setDefaultRevealedPositions(positions.sort((a, b) => a - b))
  }

  const loadInitialData = async () => {
    try {
      setIsLoading(true)
      setSetupProgress("Loading teams...")

      const { data: teamsData, error: teamsError } = await supabase.from("teams").select("*").order("id")

      if (teamsError) {
        console.error("Teams error:", teamsError)
        throw teamsError
      }

      if (!teamsData || teamsData.length === 0) {
        setWordError("No teams found in database!")
        return
      }

      setTeams(teamsData)

      setSetupProgress("Loading words...")
      const { data: wordsData, error: wordsError } = await supabase.from("words").select("*").order("created_at")

      if (wordsError) {
        console.error("Words error:", wordsError)
        throw wordsError
      }

      if (!wordsData || wordsData.length === 0) {
        setWordError("No words found in database!")
        return
      }

      setWords(wordsData)

      // Auto-start the game
      setSetupProgress("Starting game...")
      await autoStartGame(teamsData, wordsData)
    } catch (error) {
      console.error("Error loading data:", error)
      setWordError(`Database error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
      setSetupProgress("")
    }
  }

  const autoStartGame = async (teamsData: Team[], wordsData: GameWord[]) => {
    if (wordsData.length === 0) {
      setWordError("No words available to play!")
      return
    }

    try {
      // Create new game
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .insert([
          {
            status: "active",
            current_word_id: wordsData[0].id,
            current_team_id: teamsData[0].id,
          },
        ])
        .select()

      if (gameError) throw gameError

      const gameId = gameData[0].id
      setCurrentGameId(gameId)

      // Initialize game scores for all teams
      const scoreInserts = teamsData.map((team) => ({
        game_id: gameId,
        team_id: team.id,
        points: 0,
      }))

      const { error: scoresError } = await supabase.from("game_scores").insert(scoreInserts)

      if (scoresError) throw scoresError

      setGameScores(scoreInserts)
      setGameState("playing")
      setTeamsAttempted([])
      setCurrentWordIndex(0)

      // Set the team based on question number (word index) - Fixed team numbers 0,1,2,3
      const assignedTeam = 0 % 4 // First question goes to Team 1 (index 0)
      setCurrentTeam(assignedTeam)
      setOriginalTeamForQuestion(assignedTeam)
      setIsPassedQuestion(false)
      resetGame()
    } catch (error) {
      console.error("Error starting game:", error)
      setWordError("Failed to start game")
    }
  }

  const resetGame = () => {
    setGuessedLetters([])
    setRevealedPositions([])
    setWrongGuesses(0)
    setGameState("playing")
    setInputLetter("")
    
    // Show leaderboard for 5 seconds at start of new round
    setShowRoundStartLeaderboard(true)
    setTimeout(() => {
      setShowRoundStartLeaderboard(false)
    }, 5000)
  }

  const updateGameScore = async (teamId: number, points: number) => {
    if (!currentGameId) return

    try {
      const currentScore = gameScores.find((score) => score.team_id === teamId)?.points || 0
      const newPoints = currentScore + points

      const { error } = await supabase
        .from("game_scores")
        .update({ points: newPoints })
        .eq("game_id", currentGameId)
        .eq("team_id", teamId)

      if (error) throw error

      setGameScores((prev) => prev.map((score) => (score.team_id === teamId ? { ...score, points: newPoints } : score)))
    } catch (error) {
      console.error("Error updating score:", error)
    }
  }

  const nextTeamOrWord = () => {
    const newTeamsAttempted = [...teamsAttempted, currentTeam]
    setTeamsAttempted(newTeamsAttempted)

    // Check if ALL 4 teams have had their turn as the current team
    if (newTeamsAttempted.length >= 4) {
      // All 4 teams have had their turn, reveal the answer and move to next word
      setGameState("lost") // Show the answer
      setTimeout(() => {
        if (currentWordIndex + 1 < words.length) {
          const nextWordIndex = currentWordIndex + 1
          setCurrentWordIndex(nextWordIndex)

          // Assign next question to next team in rotation (fixed 0,1,2,3 cycle)
          const assignedTeam = nextWordIndex % 4
          setCurrentTeam(assignedTeam)
          setOriginalTeamForQuestion(assignedTeam)
          setTeamsAttempted([])
          setIsPassedQuestion(false)
        } else {
          setGameState("finished")
          return
        }
        resetGame()
      }, 3000) // Show answer for 3 seconds
    } else {
      // Pass to next team in sequence (fixed 0,1,2,3 cycle)
      let nextTeam = (currentTeam + 1) % 4
      while (newTeamsAttempted.includes(nextTeam)) {
        nextTeam = (nextTeam + 1) % 4
      }
      setCurrentTeam(nextTeam)
      setIsPassedQuestion(true) // Mark as passed question for 5 points
      resetGame()
    }
  }

  const passQuestion = () => {
    nextTeamOrWord()
  }

  const guessLetter = () => {
    if (!inputLetter) {
      return
    }

    const letter = inputLetter.toUpperCase()

    // Always allow the letter to be guessed (even if guessed before)
    const newGuessedLetters = [...guessedLetters, letter]
    setGuessedLetters(newGuessedLetters)

    if (!currentGameWord.word.includes(letter)) {
      const newWrongGuesses = wrongGuesses + 1
      setWrongGuesses(newWrongGuesses)

      if (newWrongGuesses >= maxWrongGuesses) {
        // Don't reveal answer here, just pass to next team
        setTimeout(passQuestion, 2000)
      }
    } else {
      // Letter exists in the word - find all positions of this letter
      const wordArray = currentGameWord.word.split("")
      const letterPositions = wordArray.map((char, index) => (char === letter ? index : -1)).filter((pos) => pos !== -1)

      // Find all positions of this letter that haven't been revealed yet (excluding default revealed positions)
      const unrevealedPositions = letterPositions.filter((pos) => 
        !revealedPositions.includes(pos) && !defaultRevealedPositions.includes(pos)
      )

      if (unrevealedPositions.length > 0) {
        // Reveal only the FIRST unrevealed occurrence of this letter
        const newRevealedPositions = [...revealedPositions, unrevealedPositions[0]]
        setRevealedPositions(newRevealedPositions)

        // Check if word is complete (all positions revealed or default revealed)
        const allPositions = [...newRevealedPositions, ...defaultRevealedPositions]
        const uniquePositions = [...new Set(allPositions)]
        const isComplete = uniquePositions.length === wordArray.length

        if (isComplete) {
          setGameState("won")
          const teamId = teams[currentTeam].id
          const points = isPassedQuestion ? 5 : currentGameWord.points
          updateGameScore(teamId, points)

          setTimeout(() => {
            if (currentWordIndex + 1 < words.length) {
              const nextWordIndex = currentWordIndex + 1
              setCurrentWordIndex(nextWordIndex)

              // Assign next question to next team in rotation (fixed 0,1,2,3 cycle)
              const assignedTeam = nextWordIndex % 4
              setCurrentTeam(assignedTeam)
              setOriginalTeamForQuestion(assignedTeam)
              setTeamsAttempted([])
              setIsPassedQuestion(false)
            } else {
              setGameState("finished")
              return
            }
            resetGame()
          }, 2000)
        }
      } else {
        // All instances of this letter are already revealed, treat as wrong guess
        const newWrongGuesses = wrongGuesses + 1
        setWrongGuesses(newWrongGuesses)

        if (newWrongGuesses >= maxWrongGuesses) {
          // Don't reveal answer here, just pass to next team
          setTimeout(passQuestion, 2000)
        }
      }
    }

    setInputLetter("")
  }

  // Display word with default revealed letters and guessed letters
  const displayWord = () => {
    if (!currentGameWord) return ""

    return currentGameWord.word
      .split("")
      .map((letter, index) => {
        // Show if it's a default revealed position or a revealed position from guessing
        if (defaultRevealedPositions.includes(index) || revealedPositions.includes(index)) {
          return letter
        }
        return "_"
      })
      .join(" ")
  }

  const getTeamScores = () => {
    return teams
      .map((team, index) => ({
        ...team,
        teamNumber: index + 1, // Fixed team numbers 1,2,3,4
        points: gameScores.find((score) => score.team_id === team.id)?.points || 0,
      }))
      .sort((a, b) => b.points - a.points)
  }

  const HangmanDrawing = ({ stage }: { stage: number }) => {
    const funnyMessages = [
      "💀 Oops! Better luck next time!",
      "😵 The hangman got me!",
      "🪦 RIP Letter Guesser",
      "💀 Game Over, Man!",
      "😮‍💨 I should have studied more letters!",
      "🎭 This is awkward...",
      "💀 At least I tried!",
      "😅 Note to self: Learn the alphabet!",
      "🤷‍♂️ Maybe next word?",
      "💀 Well, that escalated quickly!"
    ]
    
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)]
    
    return (
      <div className="relative">
        <svg width="350" height="400" viewBox="0 0 350 400" className="border rounded-lg bg-white shadow-md">
          <line x1="20" y1="370" x2="250" y2="370" stroke="#44311f" strokeWidth="8" />
          <line x1="60" y1="370" x2="60" y2="30" stroke="#44311f" strokeWidth="8" />
          <line x1="60" y1="30" x2="200" y2="30" stroke="#44311f" strokeWidth="8" />
          {stage >= 1 && <line x1="200" y1="30" x2="200" y2="80" stroke="#44311f" strokeWidth="6" />}
          {stage >= 2 && <circle cx="200" cy="110" r="25" stroke="black" strokeWidth="4" fill="none" />}
          {stage >= 3 && <line x1="200" y1="135" x2="200" y2="280" stroke="black" strokeWidth="4" />}
          {stage >= 4 && (
            <>
              <line x1="200" y1="170" x2="170" y2="220" stroke="black" strokeWidth="4" />
              <line x1="200" y1="170" x2="230" y2="220" stroke="black" strokeWidth="4" />
              <line x1="200" y1="280" x2="170" y2="330" stroke="black" strokeWidth="4" />
              <line x1="200" y1="280" x2="230" y2="330" stroke="black" strokeWidth="4" />
            </>
          )}
          
          {/* Add funny face when hangman is complete */}
          {stage >= 2 && (
            <>
              {/* Eyes */}
              {stage >= 4 ? (
                <>
                  {/* Dead X eyes */}
                  <line x1="190" y1="100" x2="195" y2="105" stroke="red" strokeWidth="3" />
                  <line x1="195" y1="100" x2="190" y2="105" stroke="red" strokeWidth="3" />
                  <line x1="205" y1="100" x2="210" y2="105" stroke="red" strokeWidth="3" />
                  <line x1="210" y1="100" x2="205" y2="105" stroke="red" strokeWidth="3" />
                </>
              ) : (
                <>
                  {/* Normal eyes */}
                  <circle cx="192" cy="105" r="3" fill="black" />
                  <circle cx="208" cy="105" r="3" fill="black" />
                </>
              )}
              
              {/* Mouth */}
              {stage >= 4 ? (
                /* Sad mouth when dead */
                <path d="M 185 125 Q 200 135 215 125" stroke="black" strokeWidth="2" fill="none" />
              ) : (
                /* Worried mouth */
                <ellipse cx="200" cy="120" rx="8" ry="4" stroke="black" strokeWidth="2" fill="none" />
              )}
            </>
          )}
        </svg>
        
        {/* Funny message when hangman is complete */}
        {stage >= 4 && (
          <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 w-full">
            <div className="bg-[#d9a65a] bg-opacity-90 text-[#44311f] text-center p-3 rounded-lg border-2 border-[#44311f] shadow-lg animate-bounce">
              <p className="text-lg font-bold">{randomMessage}</p>
              <div className="text-2xl mt-1">
                {stage >= 4 && "💀🎭🤷‍♂️"}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (gameState === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d9a65a] via-[#886636] to-[#44311f] flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <RefreshCw className="w-8 h-8 animate-spin mr-3" />
            <span className="text-lg">Loading game data...</span>
            {setupProgress && <p className="text-sm text-gray-600 mt-2">{setupProgress}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (wordError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d9a65a] via-[#886636] to-[#44311f] flex items-center justify-center">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">{wordError}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Game
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Game Finished
  if (gameState === "finished") {
    const sortedTeams = getTeamScores()
    const winner = sortedTeams[0]

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#44311f] to-[#886636] flex items-center justify-center">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-[#d9a65a]">🏆 Game Finished!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-2xl font-bold text-[#d9a65a]">Winner: {winner.name}</div>
            <div className="text-xl">Final Score: {winner.points} points</div>
            <div className="space-y-2">
              <h3 className="font-semibold">Final Leaderboard:</h3>
              {sortedTeams.map((team, index) => (
                <div key={team.id} className="flex justify-between items-center p-2 bg-[#d9a65a] bg-opacity-20 rounded">
                  <span>
                    #{index + 1} Team {team.teamNumber}: {team.name}
                  </span>
                  <span className="font-bold">{team.points} pts</span>
                </div>
              ))}
            </div>
            <Button onClick={() => window.location.reload()} className="w-full bg-[#44311f] hover:bg-[#886636]">
              Start New Game
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main Game
  const sortedTeams = getTeamScores()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d9a65a] via-[#886636] to-[#44311f] p-4">
      {/* Right Side Leaderboard */}
      <div
        className={`fixed top-0 right-0 h-full w-90 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 border-b bg-[#44311f]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#d9a65a]">🏺 Leaderboard</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="hover:bg-[#886636] text-[#d9a65a]"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto h-full">
          <div className="space-y-4">
            {sortedTeams.map((team, leaderboardIndex) => {
              const teamScore = gameScores.find((score) => score.team_id === team.id)?.points || 0
              const originalTeamIndex = teams.findIndex((t) => t.id === team.id)
              return (
                <div
                  key={team.id}
                  className={`p-4 rounded-lg border-2 ${
                    originalTeamIndex === currentTeam
                      ? "border-[#d9a65a] bg-[#d9a65a] bg-opacity-20"
                      : originalTeamIndex === originalTeamForQuestion
                        ? "border-[#886636] bg-[#886636] bg-opacity-20"
                        : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold">#{leaderboardIndex + 1}</div>
                      <div className={`w-4 h-4 rounded-full ${team.color}`}></div>
                      <div className="font-semibold text-lg">
                        Team {originalTeamIndex + 1}: {team.name}
                      </div>
                      {originalTeamIndex === originalTeamForQuestion && (
                        <Badge variant="outline" className="text-xs bg-[#886636] bg-opacity-30 border-[#886636]">
                          Assigned
                        </Badge>
                      )}
                      {teamsAttempted.includes(originalTeamIndex) && (
                        <Badge variant="outline" className="text-xs bg-[#44311f] bg-opacity-30 border-[#44311f]">
                          Attempted
                        </Badge>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-[#44311f]">{teamScore}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="max-w-6xl mx-auto">
        {/* Round Start Leaderboard Overlay */}
        {showRoundStartLeaderboard && (
          <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 shadow-2xl border-4 border-[#d9a65a]">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-[#44311f] mb-2">🏆 Current Leaderboard 🏆</h2>
                <p className="text-[#886636]">Quest {currentWordIndex + 1} Starting...</p>
              </div>
              
              <div className="space-y-3">
                {getTeamScores().map((team, index) => {
                  const originalTeamIndex = teams.findIndex((t) => t.id === team.id)
                  return (
                    <div
                      key={team.id}
                      className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                        originalTeamIndex === currentTeam
                          ? "border-[#d9a65a] bg-[#d9a65a] bg-opacity-30 animate-pulse"
                          : "border-[#886636] bg-[#886636] bg-opacity-10"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-bold text-[#44311f]">#{index + 1}</div>
                        <div className={`w-6 h-6 rounded-full ${team.color}`}></div>
                        <div>
                          <div className="font-bold text-lg text-[#44311f]">
                            Team {originalTeamIndex + 1}: {team.name}
                          </div>
                          {originalTeamIndex === currentTeam && (
                            <div className="text-sm text-[#d9a65a] font-semibold">← Current Turn</div>
                          )}
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-[#44311f]">{team.points} pts</div>
                    </div>
                  )
                })}
              </div>
              
              <div className="text-center mt-6">
                <div className="text-sm text-[#886636]">
                  Auto-closing in <span className="font-bold">5 seconds</span>...
                </div>
                <button
                  onClick={() => setShowRoundStartLeaderboard(false)}
                  className="mt-2 px-4 py-2 bg-[#44311f] text-[#d9a65a] rounded-lg hover:bg-[#886636] transition-colors"
                >
                  Continue Game
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-24"></div> {/* Spacer for centering */}
            <h1 className="text-4xl font-bold text-[#44311f] flex items-center gap-2">
              <span>🏔️</span> Belmonts Quest
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-[#d9a65a] bg-opacity-30 border-[#44311f] hover:bg-[#d9a65a] hover:bg-opacity-50 text-[#44311f]"
            >
              <Menu className="w-4 h-4 mr-2" />
              Leaderboard
            </Button>
          </div>
          <div className="flex justify-center gap-4 text-sm flex-wrap mb-4">
            <Badge variant="outline" className="bg-[#d9a65a] bg-opacity-30 border-[#44311f] text-[#44311f]">
              Quest: {currentWordIndex + 1}/{words.length}
            </Badge>
            <Badge className="bg-[#44311f] text-[#d9a65a]">Assigned to: {teams[originalTeamForQuestion]?.name}</Badge>
            <Badge className={teams[currentTeam]?.color + " text-white"}>Current: {teams[currentTeam]?.name}</Badge>
            <Badge variant="secondary" className="bg-[#886636] text-white">
              Tribes Attempted: {teamsAttempted.length + 1}/4
            </Badge>
            {isPassedQuestion && <Badge className="bg-[#d9a65a] text-black">Passed Quest (5 pts)</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Hangman */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-[#44311f]">Gallows</CardTitle>
                <div className="text-center">
                  <Badge variant={wrongGuesses >= maxWrongGuesses ? "destructive" : "secondary"} className="bg-[#886636] text-white">
                    Wrong Guesses: {wrongGuesses}/{maxWrongGuesses}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex justify-center">
                <HangmanDrawing stage={wrongGuesses} />
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Sacred Word */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-center text-[#44311f]">Sacred Word</CardTitle>
                <p className="text-center text-sm text-[#886636]">{currentGameWord?.word.length} letters</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                    <div className="text-6xl font-mono font-bold tracking-wider mb-4 min-h-[4rem] flex items-center justify-center">
                    {displayWord()}
                    </div>
                  <Badge className={isPassedQuestion ? "bg-[#d9a65a] text-black text-xs px-2 py-1" : "bg-[#44311f] text-[#d9a65a] text-xs px-2 py-1"}>
                    Gold: {isPassedQuestion ? 5 : currentGameWord?.points}
                  </Badge>
                </div>

                {gameState === "playing" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        maxLength={1}
                        value={inputLetter}
                        onChange={(e) => setInputLetter(e.target.value.toUpperCase())}
                        placeholder="Enter a letter"
                        className="text-center text-2xl h-12"
                        onKeyPress={(e) => e.key === "Enter" && guessLetter()}
                      />
                      <Button
                        onClick={guessLetter}
                        disabled={!inputLetter}
                        className="h-12 px-6 bg-[#44311f] hover:bg-[#886636] text-[#d9a65a]"
                      >
                        Guess
                      </Button>
                      <Button
                        onClick={passQuestion}
                        variant="outline"
                        className="h-12 px-4 border-[#44311f] text-[#44311f] hover:bg-[#d9a65a] hover:bg-opacity-30 bg-transparent"
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        Pass
                      </Button>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-2">Guessed Letters:</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {guessedLetters.map((letter, index) => (
                          <Badge key={`${letter}-${index}`} variant="outline" className="text-sm px-3 py-1">
                            {letter}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-center text-xs text-[#44311f] bg-[#d9a65a] bg-opacity-30 p-3 rounded-lg border border-[#886636]">
                      <p className="font-semibold mb-1">⚔️ Quest Rules ⚔️</p>
                      <p>• Each sacred word is assigned to a tribe in rotation</p>
                      <p>• If a tribe fails, the next tribe may attempt for 5 gold</p>
                      <p>• The word is revealed only when all tribes have tried</p>
                    </div>
                  </div>
                )}

                {gameState === "won" && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#d9a65a] mb-2">🏆 Victory!</div>
                    <p className="text-lg">
                      +{isPassedQuestion ? 5 : currentGameWord?.points} gold to {teams[currentTeam]?.name}
                    </p>
                    {isPassedQuestion && <p className="text-sm text-[#886636]">Passed quest bonus!</p>}
                    <p className="text-sm text-[#44311f]">Moving to next sacred word...</p>
                  </div>
                )}

                {gameState === "lost" && (
                  <div className="text-center">
                    {teamsAttempted.length >= 4 ? (
                      <>
                        <div className="text-3xl font-bold text-red-700 mb-2">📜 Word Revealed!</div>
                        <p className="text-lg text-[#44311f]">
                          The sacred word was: <strong>{currentGameWord?.word}</strong>
                        </p>
                        <p className="text-sm text-[#886636]">All tribes have tried. Moving to next quest...</p>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-[#d9a65a] mb-2">⚡ Quest Failed!</div>
                        <p className="text-lg text-[#44311f]">{teams[currentTeam]?.name} could not solve the riddle</p>
                        <p className="text-sm text-[#886636]">Passing to next tribe...</p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
