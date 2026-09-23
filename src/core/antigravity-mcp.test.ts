import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureClientGitignore,
  syncAllFleetToAntigravity,
  syncClientWorkspaceMcp,
  syncGlobalAntigravityMcp,
  toAntigravityServer,
  toAntigravityServers,
} from './antigravity-mcp'

describe('antigravity-mcp', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agy-mcp-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe('toAntigravityServer', () => {
    it('populates serverUrl from url for HTTP servers', () => {
      const server = {
        type: 'http',
        url: 'https://api.genudo.ai/mcp',
        headers: { Authorization: 'Bearer token123' },
      }
      const converted = toAntigravityServer(server)
      expect(converted.serverUrl).toBe('https://api.genudo.ai/mcp')
      expect(converted.url).toBe('https://api.genudo.ai/mcp')
      expect(converted.headers).toEqual({ Authorization: 'Bearer token123' })
    })

    it('leaves stdio servers unmodified', () => {
      const stdio = {
        command: 'npx',
        args: ['-y', 'my-mcp'],
        env: { FOO: 'bar' },
      }
      const converted = toAntigravityServer(stdio)
      expect(converted).toEqual(stdio)
    })

    it('handles non-object safely', () => {
      expect(toAntigravityServer(null)).toEqual({})
      expect(toAntigravityServer(undefined)).toEqual({})
      expect(toAntigravityServer('string')).toEqual({})
    })
  })

  describe('toAntigravityServers', () => {
    it('converts a dictionary of servers', () => {
      const input = {
        genudo: {
          type: 'http',
          url: 'https://api.genudo.ai/mcp',
        },
        local: {
          command: 'node',
          args: ['server.js'],
        },
      }
      const res = toAntigravityServers(input)
      expect(res.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')
      expect(res.local.command).toBe('node')
    })
  })

  describe('syncGlobalAntigravityMcp', () => {
    it('creates file and adds servers when config did not exist', () => {
      const configPath = join(tmp, 'config', 'mcp_config.json')
      syncGlobalAntigravityMcp(
        {
          genudo: {
            url: 'https://api.genudo.ai/mcp',
            headers: { Authorization: 'Bearer test' },
          },
        },
        configPath,
      )

      expect(existsSync(configPath)).toBe(true)
      const data = JSON.parse(readFileSync(configPath, 'utf8'))
      expect(data.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')
    })

    it('merges new servers into existing configuration preserving pre-existing ones', () => {
      const configPath = join(tmp, 'config', 'mcp_config.json')
      mkdirSync(join(tmp, 'config'), { recursive: true })
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            supabase: { command: 'npx', args: ['supabase'] },
          },
        }),
      )

      syncGlobalAntigravityMcp(
        {
          genudo: {
            url: 'https://api.genudo.ai/mcp',
          },
        },
        configPath,
      )

      const data = JSON.parse(readFileSync(configPath, 'utf8'))
      expect(data.mcpServers.supabase).toBeDefined()
      expect(data.mcpServers.supabase.command).toBe('npx')
      expect(data.mcpServers.genudo).toBeDefined()
      expect(data.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')
    })

    it('purges dropped servers like genudo-old-platform', () => {
      const configPath = join(tmp, 'config', 'mcp_config.json')
      mkdirSync(join(tmp, 'config'), { recursive: true })
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'genudo-old-platform': { type: 'http', url: 'https://old.genudo.ai' },
            supabase: { command: 'npx' },
          },
        }),
      )

      syncGlobalAntigravityMcp(
        {
          genudo: { url: 'https://api.genudo.ai/mcp' },
        },
        configPath,
      )

      const data = JSON.parse(readFileSync(configPath, 'utf8'))
      expect(data.mcpServers['genudo-old-platform']).toBeUndefined()
      expect(data.mcpServers.supabase).toBeDefined()
      expect(data.mcpServers.genudo).toBeDefined()
    })
  })

  describe('syncClientWorkspaceMcp', () => {
    it('reads .mcp.json and writes .agents/mcp_config.json, .gemini/settings.json, and global config', () => {
      const clientDir = join(tmp, 'client-a')
      mkdirSync(clientDir, { recursive: true })
      const globalConfigPath = join(tmp, 'global_mcp_config.json')

      writeFileSync(
        join(clientDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            genudo: {
              type: 'http',
              url: 'https://api.genudo.ai/mcp',
              headers: { Authorization: 'Bearer abc' },
            },
          },
        }),
      )

      syncClientWorkspaceMcp(clientDir, undefined, globalConfigPath)

      // 1. check .agents/mcp_config.json
      const agentsFile = join(clientDir, '.agents', 'mcp_config.json')
      expect(existsSync(agentsFile)).toBe(true)
      const agentsData = JSON.parse(readFileSync(agentsFile, 'utf8'))
      expect(agentsData.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')

      // 2. check .gemini/settings.json
      const geminiFile = join(clientDir, '.gemini', 'settings.json')
      expect(existsSync(geminiFile)).toBe(true)
      const geminiData = JSON.parse(readFileSync(geminiFile, 'utf8'))
      expect(geminiData.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')

      // 3. check global config
      expect(existsSync(globalConfigPath)).toBe(true)
      const globalData = JSON.parse(readFileSync(globalConfigPath, 'utf8'))
      expect(globalData.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')
    })
  })

  describe('syncAllFleetToAntigravity', () => {
    it('scans all projects in vault and syncs their .mcp.json servers', () => {
      const vaultPath = join(tmp, 'vault')
      const client1 = join(vaultPath, 'projects', 'client1')
      const client2 = join(vaultPath, 'projects', 'client2')
      mkdirSync(client1, { recursive: true })
      mkdirSync(client2, { recursive: true })
      const globalConfigPath = join(tmp, 'global_mcp_config.json')

      writeFileSync(
        join(client1, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            genudo: { url: 'https://api.genudo.ai/mcp' },
          },
        }),
      )
      writeFileSync(
        join(client2, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            customTool: { command: 'echo', args: ['hello'] },
          },
        }),
      )

      syncAllFleetToAntigravity(vaultPath, globalConfigPath)

      const globalData = JSON.parse(readFileSync(globalConfigPath, 'utf8'))
      expect(globalData.mcpServers.genudo.serverUrl).toBe('https://api.genudo.ai/mcp')
      expect(globalData.mcpServers.customTool.command).toBe('echo')
    })
  })

  describe('ensureClientGitignore', () => {
    it('creates .gitignore with .agents/ and .gemini/ if file does not exist', () => {
      const clientDir = join(tmp, 'client-new')
      mkdirSync(clientDir, { recursive: true })
      ensureClientGitignore(clientDir)
      const gitignore = readFileSync(join(clientDir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('.agents/')
      expect(gitignore).toContain('.gemini/')
    })

    it('appends .agents/ and .gemini/ to existing .gitignore without duplicating', () => {
      const clientDir = join(tmp, 'client-existing')
      mkdirSync(clientDir, { recursive: true })
      writeFileSync(join(clientDir, '.gitignore'), '.mcp.json\n.claude/\n')
      ensureClientGitignore(clientDir)
      let gitignore = readFileSync(join(clientDir, '.gitignore'), 'utf8')
      expect(gitignore).toContain('.mcp.json')
      expect(gitignore).toContain('.agents/')
      expect(gitignore).toContain('.gemini/')

      // running again should not duplicate
      ensureClientGitignore(clientDir)
      gitignore = readFileSync(join(clientDir, '.gitignore'), 'utf8')
      expect(gitignore.split('.agents/').length - 1).toBe(1)
    })
  })
})
