'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { SearchResult } from '@/lib/types';

/**
 * Check if a mechanic is an encounter flow mechanic
 */
function isEncounterFlowMechanic(mechanicName: string): boolean {
  const flowKeywords = ['flow', 'strategy', 'progression', 'overall encounter'];
  const nameLower = mechanicName.toLowerCase();
  return flowKeywords.some(keyword => nameLower.includes(keyword));
}

interface SearchInterfaceProps {
  quickReferenceMode?: boolean;
}

export function SearchInterface({ quickReferenceMode = false }: SearchInterfaceProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // Filters
  const [dungeonRaidName, setDungeonRaidName] = useState<string>('');
  const [encounterType, setEncounterType] = useState<string>('');
  const [mechanicType, setMechanicType] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [contestModeOnly, setContestModeOnly] = useState<boolean>(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          filters: {
            ...(dungeonRaidName && { dungeonRaidName }),
            ...(encounterType && { encounterType }),
            ...(mechanicType && { mechanicType }),
            ...(difficulty && { difficulty }),
            ...(contestModeOnly && { contestModeOnly }),
          },
          limit: quickReferenceMode ? 5 : 10,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, dungeonRaidName, encounterType, mechanicType, difficulty, contestModeOnly, quickReferenceMode]);

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Auto-expand encounter flow mechanics when results change
  useEffect(() => {
    if (results.length > 0) {
      setExpandedCards((prev) => {
        const next = new Set(prev);
        results.forEach((result) => {
          if (isEncounterFlowMechanic(result.mechanic.name)) {
            next.add(result.id);
          }
        });
        return next;
      });
    }
  }, [results]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Search Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search mechanics, puzzles, or ask a question..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading || !query.trim()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Searching...
              </>
            ) : (
              'Search'
            )}
          </Button>
        </div>

        {/* Filters */}
        {!quickReferenceMode && (
          <div className="flex flex-wrap gap-2">
            <Select value={dungeonRaidName || 'all'} onValueChange={(value) => setDungeonRaidName(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Dungeons/Raids" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dungeons/Raids</SelectItem>
                <SelectItem value="Vesper's Host">Vesper's Host (3-player, soloable)</SelectItem>
                <SelectItem value="Sundered Doctrine">Sundered Doctrine (3-player, soloable)</SelectItem>
                <SelectItem value="Leviathan">Leviathan (Cabal/Star Wars themed)</SelectItem>
                <SelectItem value="Vow of the Disciple">Vow of the Disciple</SelectItem>
                <SelectItem value="Duality">Duality</SelectItem>
                <SelectItem value="Spire of the Watcher">Spire of the Watcher</SelectItem>
              </SelectContent>
            </Select>

            <Select value={encounterType || 'all'} onValueChange={(value) => setEncounterType(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Encounters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Encounters</SelectItem>
                <SelectItem value="opening">Opening</SelectItem>
                <SelectItem value="encounter">Encounter</SelectItem>
                <SelectItem value="boss">Boss</SelectItem>
                <SelectItem value="traversal">Traversal</SelectItem>
              </SelectContent>
            </Select>

            <Select value={mechanicType || 'all'} onValueChange={(value) => setMechanicType(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Mechanics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Mechanics</SelectItem>
                <SelectItem value="puzzle">Puzzle</SelectItem>
                <SelectItem value="boss">Boss</SelectItem>
                <SelectItem value="symbol">Symbol</SelectItem>
                <SelectItem value="plate">Plate</SelectItem>
                <SelectItem value="add-clear">Add Clear</SelectItem>
              </SelectContent>
            </Select>

            <Select value={difficulty || 'all'} onValueChange={(value) => setDifficulty(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All Difficulties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={contestModeOnly ? 'default' : 'outline'}
              onClick={() => setContestModeOnly(!contestModeOnly)}
            >
              Contest Mode Only
            </Button>
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && results.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No results found. Try a different search query.
              </p>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result) => {
              const isExpanded = expandedCards.has(result.id);
              const isFlowMechanic = isEncounterFlowMechanic(result.mechanic.name);
              return (
                <Card 
                  key={result.id} 
                  className={`transition-all ${
                    isFlowMechanic 
                      ? 'border-2 border-primary bg-primary/5 shadow-lg' 
                      : ''
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          {isFlowMechanic && (
                            <Sparkles className="h-5 w-5 text-primary" />
                          )}
                          {result.mechanic.name}
                          <Badge variant="outline">
                            {(result.score * 100).toFixed(0)}% match
                          </Badge>
                          {isFlowMechanic && (
                            <Badge variant="default" className="bg-primary text-primary-foreground">
                              ⭐ ENCOUNTER FLOW
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {result.dungeonRaid.name} • {result.encounter.name}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpand(result.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge>{result.mechanic.type}</Badge>
                      {result.mechanic.difficulty && (
                        <Badge variant="secondary">{result.mechanic.difficulty}</Badge>
                      )}
                      {result.mechanic.contestModeSpecific && (
                        <Badge variant="destructive">Contest Mode</Badge>
                      )}
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Description</h4>
                        <p className="text-sm text-muted-foreground">
                          {result.mechanic.description}
                        </p>
                      </div>
                      {result.mechanic.solution && (
                        <div>
                          <h4 className="font-semibold mb-2">Solution</h4>
                          <p className="text-sm text-muted-foreground">
                            {result.mechanic.solution}
                          </p>
                        </div>
                      )}
                      {result.mechanic.tips && result.mechanic.tips.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">Tips</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {result.mechanic.tips.map((tip, idx) => (
                              <li key={idx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.mechanic.contestModeNotes && (
                        <div>
                          <h4 className="font-semibold mb-2">Contest Mode Notes</h4>
                          <p className="text-sm text-muted-foreground">
                            {result.mechanic.contestModeNotes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
