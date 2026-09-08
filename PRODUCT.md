# ARRA Oracle GrokBot Bridge

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nat, the owner of a private Grok Bot bridge, managing bot conversations and searching imported development history.

## Product Purpose

An owner-authenticated web interface and MCP endpoint for working with Grok Bot agents over NetBird. A user can select a bot, submit a message, verify its recorded reply, create a new bot/conversation, and search locally indexed history.

## Operating Context

React and Tailwind frontend; Express backend; SQLite operation records; LanceDB history vectors. The browser reaches the local bridge; the bridge reaches Grok Bot via SSH. These connections are independent. An online web app does not prove the remote bot is reachable.

## Capabilities and Constraints

- Authentication uses an owner secret; browser sessions and CSRF credentials must not enter persistent browser storage.
- Sending and creation use stable operation IDs. An uncertain response must not trigger an automatic second write.
- Gateway acceptance is not proof of a recorded reply. Agent profile verification is not proof of a selected native app window.
- No independent thread reset/fork endpoint is established. New bot means a new one-to-one agent/conversation.
- The current public HTTPS deployment and live creation remain unverified.
- Private imported history has source and line provenance; it is not live remote transcript browsing.

## Brand Commitments

Product name: **ARRA Oracle GrokBot Bridge**, explicitly named by the user.

User approved a dark, sidebar-first interface following the supplied Grok Bot app screenshot, with New bot prominent and technical details under Connections. Build directly in React, not through generated mockups.

## Evidence on Hand

Actual backend APIs, source-linked history, fixture tests, and local HTTP/MCP smoke results. No synthetic conversation may be presented as a live bot reply.

## Product Principles

- Put conversations before infrastructure.
- Make the difference between submitted and verified visible.
- Preserve drafts and identifiers through uncertainty.
- Keep authentication separate from remote connectivity.
