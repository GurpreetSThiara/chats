# TeamSync - Team Communication Platform

## Overview

TeamSync is a full-stack team communication platform built as a modern Slack alternative. The application provides real-time messaging, workspace management, channel organization, and direct messaging capabilities. It features a clean, responsive design with dark/light mode support and is optimized for desktop, tablet, and mobile experiences.

The platform is built with a React frontend using TypeScript and Tailwind CSS, an Express.js backend with PostgreSQL database, and includes real-time features via WebSocket connections. The application supports workspace-based team organization with public/private channels, threaded conversations, direct messaging, file sharing, and comprehensive search functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: Native WebSocket API for live messaging and notifications
- **Theme System**: Custom theme provider supporting light/dark modes with localStorage persistence
- **Form Handling**: React Hook Form with Zod validation schemas
- **Mobile Responsiveness**: Custom mobile detection hooks and responsive design patterns

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful API with standardized error handling and request logging
- **File Handling**: Multer middleware for file upload processing with memory storage
- **WebSocket Server**: ws library for real-time bidirectional communication
- **Development Tools**: Vite integration for hot module replacement in development

### Authentication & Authorization
- **Authentication Provider**: Replit Auth integration using OpenID Connect
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)
- **Authorization**: Workspace-level role-based permissions (admin, member, guest)
- **Security**: HTTP-only secure cookies with configurable session TTL

### Database Design
- **Primary Database**: PostgreSQL with Neon serverless connection pooling
- **Schema Management**: Drizzle migrations for version-controlled database evolution
- **Core Entities**: 
  - Users with profile information and status
  - Workspaces with ownership and member management
  - Channels (public/private) with member access control
  - Messages with threading, reactions, and mention support
  - Direct messaging between workspace members
- **Indexing Strategy**: Optimized queries for message retrieval and search operations

### Real-time Features
- **WebSocket Architecture**: Persistent connections for live message delivery
- **Channel Subscriptions**: Users automatically join relevant channel rooms
- **Typing Indicators**: Real-time typing status broadcasting
- **Message Broadcasting**: Instant message delivery to connected clients
- **Connection Management**: Automatic reconnection with exponential backoff

### File Storage & Media
- **Upload Processing**: In-memory storage with configurable size limits (10MB default)
- **File Types**: Support for images, PDFs, and document previews
- **Storage Strategy**: Designed for cloud storage integration (AWS S3 compatible)

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL serverless database connection
- **drizzle-orm**: Type-safe database ORM and query builder
- **@tanstack/react-query**: Server state management and caching
- **wouter**: Lightweight React routing library

### UI & Styling Dependencies
- **@radix-ui/***: Headless UI components for accessibility and consistency
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library for consistent iconography

### Authentication & Session Management
- **openid-client**: OpenID Connect authentication client
- **passport**: Authentication middleware
- **connect-pg-simple**: PostgreSQL session store
- **express-session**: Session management middleware

### Development & Build Tools
- **vite**: Fast build tool and development server
- **typescript**: Type safety and enhanced developer experience
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Replit-specific development tools

### Form & Validation Libraries
- **react-hook-form**: Performant form state management
- **@hookform/resolvers**: Form validation resolvers
- **zod**: Schema validation and type inference

### Real-time & Communication
- **ws**: WebSocket server implementation
- **multer**: File upload middleware for Express

### Utility Libraries
- **date-fns**: Date manipulation and formatting
- **clsx & tailwind-merge**: Conditional className utilities
- **memoizee**: Function memoization for performance optimization