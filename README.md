# React Template

A modern, scalable React starter template built with **React**, **TypeScript**, and **Vite**. This template eliminates repetitive project setup by providing a clean architecture, essential libraries, and reusable development patterns out of the box.

Rather than serving as a simple boilerplate, this template promotes a feature-based architecture that keeps applications organized, maintainable, and easy to scale.

---

## Features

- React + TypeScript
- Vite for fast development and optimized production builds
- React Router preconfigured
- TanStack Query (React Query) configured for server state management
- Zod for schema validation and type inference
- Global Error Boundary setup
- Feature-based folder structure
- Separation of data hooks and UI hooks
- Shared Context and Providers
- Centralized application configuration
- Shared TypeScript types
- Ready for medium and large-scale applications

---

## Folder Structure

```text
src
│
├── assets/
├── components/
├── config/
│   └── constants.ts
│
├── context/
├── providers/
│
├── features/
│   ├── Home/
│   ├── Login/
│   └── ...
│
├── hooks/
│   ├── data/
│   └── ui/
│
├── services/
├── types/
│   └── types.ts
│
├── utils/
├── validation/
│   └── validation.ts
│
├── App.tsx
└── main.tsx
```

---

## Architecture

This template follows a **feature-based architecture**.

Each page or major feature resides inside its own directory and can evolve independently. As features grow, they can maintain their own components, hooks, validation schemas, types, API logic, and styles without affecting unrelated parts of the application.

Example:

```text
features/
└── Login/
    ├── components/
    ├── hooks/
    │   ├── data/
    │   └── ui/
    ├── validation.ts
    ├── types.ts
    ├── Login.tsx
    └── Login.css
```

This approach improves maintainability, encourages encapsulation, and keeps large projects easy to navigate.

---

## Hook Organization

Hooks are organized by responsibility.

### Data Hooks

The `hooks/data` directory contains hooks responsible for interacting with APIs and managing server state using **TanStack Query**.

Typical responsibilities include:

- Fetching data
- Creating, updating, and deleting resources
- Query invalidation
- Cache management

Example:

```text
hooks/
└── data/
    ├── useLogin.ts
    ├── useGetUsers.ts
    └── useCreatePost.ts
```

### UI Hooks

The `hooks/ui` directory contains hooks responsible for UI behavior and local state management.

Typical responsibilities include:

- Form handling
- Search functionality
- Drag-and-drop
- Pagination
- Modal management
- Component-specific logic

Example:

```text
hooks/
└── ui/
    ├── useLoginForm.ts
    ├── useSearch.ts
    └── useModal.ts
```

Keeping UI logic separate from server-state logic results in cleaner, more reusable components.

---

## Validation

Validation is handled using **Zod**.

Schemas are stored in dedicated `validation.ts` files, making validation reusable and easy to maintain while benefiting from TypeScript type inference.

Example:

```text
features/
└── Login/
    ├── validation.ts
```

---

## Shared Types

Global application types are stored inside the `types` directory, while feature-specific types remain within their respective feature folders.

This keeps globally shared models centralized while allowing features to remain self-contained.

---

## Configuration

Application-wide constants and configuration are centralized inside the `config` directory.

Typical examples include:

- API endpoints
- Route constants
- Default values
- Environment-based configuration

Centralizing configuration reduces duplication and simplifies future changes.

---

## Error Handling

The project includes a global Error Boundary to gracefully handle unexpected rendering errors.

Instead of allowing the entire application to crash, rendering errors are caught and replaced with a fallback UI that can be customized to suit your application's needs.

---

## Why This Template?

Many starter templates focus only on installing common dependencies.

This template also provides an opinionated architecture that encourages separation of concerns, maintainability, and scalability from the beginning of a project.

The goal is to allow developers to focus on building features instead of repeatedly configuring project structure and application setup.

---

## Getting Started

Clone the repository:

```bash
git clone https://github.com/your-username/react-template.git
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

---

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Zod
- CSS

---

## License

This project is licensed under the MIT License.