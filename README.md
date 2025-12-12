# 🎮 Day 1 Mechanics Assistant

> An AI-powered RAG (Retrieval-Augmented Generation) application designed to help Destiny 2 teams solve dungeon mechanics during Day 1 Contest Mode runs in real-time.

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-430098?logo=pinecone)](https://www.pinecone.io/)
[![Anthropic Claude](https://img.shields.io/badge/Claude-AI-000000?logo=anthropic)](https://www.anthropic.com/)

## ✨ Overview

Day 1 Mechanics Assistant is a production-ready web application that leverages cutting-edge AI technologies to provide instant, contextual help for Destiny 2 dungeon mechanics. Built for competitive Day 1 contest mode runs, the system combines semantic search with large language models to deliver accurate, relevant solutions in real-time.

### Key Highlights

- **RAG Architecture**: Implements Retrieval-Augmented Generation for accurate, context-aware responses
- **Real-time Streaming**: Provides instant, streaming responses using Anthropic's Claude API
- **Semantic Search**: Powered by OpenAI embeddings and Pinecone vector database for intelligent mechanic retrieval
- **Production-Ready**: Includes rate limiting, caching, error handling, and optimized performance
- **Modern Stack**: Built with Next.js 16, React 19, TypeScript, and Tailwind CSS

## 🚀 Features

### Core Functionality

- **Intelligent Chat Interface**: Ask questions about dungeon mechanics and get contextual answers based on historical data
- **Semantic Search**: Search through mechanics with natural language queries
- **Streaming Responses**: Real-time token streaming for faster user experience
- **Encounter-Specific Filtering**: Filter mechanics by dungeon, encounter type, and difficulty
- **Context-Aware Assistance**: AI actively helps solve mechanics by analyzing descriptions and suggesting solutions

### Technical Features

- **Vector Embeddings**: OpenAI `text-embedding-3-small` for semantic understanding
- **Rate Limiting**: IP-based rate limiting to prevent abuse
- **Response Caching**: In-memory caching to reduce API costs and improve latency
- **Type Safety**: Full TypeScript coverage with Zod schema validation
- **Dark Mode**: Theme switching with persistent preferences
- **Responsive Design**: Optimized for desktop and mobile devices

## 🏗️ Architecture

```
┌─────────────────┐
│   Next.js App   │
│  (React 19)     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│ Chat  │ │ Search  │
│  API  │ │   API   │
└───┬───┘ └──┬──────┘
    │        │
    └───┬────┘
        │
┌───────▼────────┐
│   RAG Layer    │
│  (lib/rag.ts)  │
└───────┬────────┘
        │
    ┌───┴───┐
    │       │
┌───▼──┐ ┌─▼──────────┐
│Vector│ │ Anthropic  │
│Store │ │   Claude   │
│(Pine│ │   API       │
│cone) │ │            │
└───┬──┘ └────────────┘
    │
┌───▼──────────────┐
│ OpenAI Embeddings│
└──────────────────┘
```

### Data Flow

1. **User Query** → Chat/Search API endpoint
2. **Query Embedding** → OpenAI generates vector embedding
3. **Semantic Search** → Pinecone finds similar mechanics
4. **Context Building** → Relevant mechanics compiled into context
5. **LLM Generation** → Claude generates response with context
6. **Streaming Response** → Real-time tokens sent to client

## 🛠️ Tech Stack

### Frontend
- **Next.js 16.0** - React framework with App Router
- **React 19.2** - UI library
- **TypeScript 5.0** - Type safety
- **Tailwind CSS 4** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **next-themes** - Dark mode support
- **Zod** - Schema validation

### Backend & AI
- **Anthropic Claude (Sonnet 4)** - Large language model for responses
- **OpenAI API** - Text embeddings (`text-embedding-3-small`)
- **Pinecone** - Vector database for semantic search
- **Next.js API Routes** - Serverless backend endpoints

### Development Tools
- **ESLint** - Code linting
- **tsx** - TypeScript execution for scripts
- **dotenv** - Environment variable management

## 📦 Installation

### Prerequisites

- Node.js 20+ and npm/yarn/pnpm
- API keys for:
  - [Anthropic Claude](https://console.anthropic.com/)
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Pinecone](https://app.pinecone.io/)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/justinscott12/dungeonhelper.git
   cd dungeonhelper
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your API keys:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   PINECONE_API_KEY=your_pinecone_api_key_here
   PINECONE_INDEX_NAME=destiny-mechanics  # Optional, defaults to this
   ```

4. **Ingest mechanics data**
   
   Run the ingestion script to populate the vector database:
   ```bash
   npm run ingest
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run ingest` | Ingest mechanics from JSON files into Pinecone |
| `npm run wipe` | Delete all vectors from Pinecone |
| `npm run reingest` | Wipe and re-ingest all mechanics |
| `npm run inspect` | Inspect all mechanics in Pinecone database |
| `npm run inspect:wr` | Inspect mechanics for "Warlord's Ruin" |

## 🔌 API Endpoints

### POST `/api/chat`

Streaming chat endpoint for mechanic assistance.

**Request:**
```json
{
  "query": "How do I solve the final boss in Warlord's Ruin?",
  "messages": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ],
  "filters": {
    "dungeonRaidName": "Warlord's Ruin",
    "encounterType": "boss"
  }
}
```

**Response:** Server-Sent Events stream

### POST `/api/search`

Semantic search for mechanics.

**Request:**
```json
{
  "query": "symbol matching mechanics",
  "filters": {
    "dungeonRaidName": "Duality",
    "difficulty": "medium"
  },
  "limit": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "mechanic-id",
      "score": 0.95,
      "mechanic": { ... },
      "encounter": { ... },
      "dungeonRaid": { ... }
    }
  ],
  "cached": false,
  "remaining": 19
}
```

## 🗂️ Project Structure

```
dungeonhelper/
├── app/
│   ├── api/              # API routes
│   │   ├── chat/         # Streaming chat endpoint
│   │   ├── search/       # Semantic search endpoint
│   │   ├── ingest/       # Data ingestion endpoint
│   │   └── embed/        # Embedding generation endpoint
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/
│   ├── ChatInterface.tsx # Main chat UI component
│   ├── SearchInterface.tsx # Search UI component
│   └── ui/               # Reusable UI components
├── lib/
│   ├── rag.ts            # RAG orchestration logic
│   ├── embeddings.ts     # OpenAI embedding generation
│   ├── vector-store.ts   # Pinecone integration
│   ├── cache.ts          # In-memory caching
│   ├── rate-limit.ts     # Rate limiting logic
│   └── types.ts          # TypeScript type definitions
├── data/
│   └── mechanics/        # JSON files with dungeon mechanics
├── scripts/
│   ├── ingest.ts         # Data ingestion script
│   ├── inspect.ts        # Database inspection script
│   └── wipe.ts           # Database cleanup script
└── public/               # Static assets
```

## 🎯 Key Implementation Details

### RAG System

The application implements a sophisticated RAG pipeline:

1. **Query Understanding**: Extracts dungeon names, encounter positions, and mechanic types from natural language
2. **Smart Filtering**: Prioritizes encounter flow mechanics and filters by encounter order
3. **Context Building**: Constructs comprehensive context with prioritized mechanics
4. **Response Generation**: Uses Claude with custom system prompts for accurate, contextual responses

### Vector Database Strategy

- **Embedding Model**: OpenAI `text-embedding-3-small` (512 dimensions)
- **Vector Store**: Pinecone serverless index
- **Metadata Filtering**: Efficient filtering by dungeon, encounter type, difficulty
- **Similarity Search**: Cosine similarity for semantic matching

### Performance Optimizations

- **Response Caching**: 5-minute cache for search results
- **Streaming**: Token-level streaming for perceived performance
- **Batch Processing**: Efficient embedding generation in batches
- **Rate Limiting**: Prevents API abuse and controls costs

## 🔒 Security

- ✅ All API keys stored in environment variables
- ✅ Rate limiting on all API endpoints
- ✅ Input validation with Zod schemas
- ✅ No sensitive data in repository
- ✅ `.env.local` excluded from version control

## 📊 Data Sources

The application includes mechanics data for:
- **Warlord's Ruin** (Dungeon)
- **Duality** (Dungeon)
- **Vesper's Host** (Dungeon)
- **Sundered Doctrine** (Dungeon)
- **Equilibrium** (Dungeon)
- **Day 1 Contest Mode** (General Information)

All mechanics are stored as structured JSON in `data/mechanics/` and can be extended easily.

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- AWS Amplify
- Docker containers

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Justin Scott**

- GitHub: [@justinscott12](https://github.com/justinscott12)
- Repository: [dungeonhelper](https://github.com/justinscott12/dungeonhelper)

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for Claude API
- [OpenAI](https://openai.com/) for embedding models
- [Pinecone](https://www.pinecone.io/) for vector database
- [Next.js](https://nextjs.org/) team for the amazing framework
- Destiny 2 community for mechanics documentation

---

⭐ If you found this project helpful, consider giving it a star!
