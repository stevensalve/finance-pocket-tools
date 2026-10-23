# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- Launcher page with search.
- Ten offline finance and accounts tools: Invoice Maker, GST Calculator & Summary, Loan & EMI Calculator, Depreciation Schedule, Bank Reconciliation, Receivables & Payables Aging, Budget vs Actual, Expense Claims Summariser, Compliance Calendar, Cash-flow Forecaster.
- Shared theme (light/dark) and helper library, synced into each tool.
- Unit tests for every tool's logic, repository checks (offline guarantee, structure, shared-file sync), ESLint and Prettier.
- GitHub Actions for CI and GitHub Pages deployment; Dependabot configuration; issue and pull-request templates.
- Indian-money and date helpers in the shared library (lakh/crore grouping, amounts in words, DD/MM/YYYY).
- Scripts to scaffold a new tool and to export a tool as a standalone repository.
