# Troubleshooting Guide & FAQ

This guide helps you resolve common issues and answers frequently asked questions about the CLI-based code review system.

## Table of Contents

- [Common Issues](#common-issues)
- [Error Messages](#error-messages)
- [Performance Issues](#performance-issues)
- [Configuration Problems](#configuration-problems)
- [Integration Issues](#integration-issues)
- [FAQ](#faq)

## Common Issues

### 1. "Code review system not initialized"

**Problem**: The system cannot find the `.code_review` directory.

**Solution**:
```bash
# Initialize the system
code-review init

# Force reinitialization if needed
code-review init --force
```

**Prevention**: Always run `code-review init` in your repository before using other commands.

### 2. "Ollama connection failed"

**Problem**: Cannot connect to Ollama service.

**Solutions**:
```bash
# Check if Ollama is running
ollama list

# Start Ollama service
ollama serve

# Check Ollama status
curl http://localhost:11434/api/tags

# Verify configuration
code-review config --get "llm.provider"
```

**Common Causes**:
- Ollama service not started
- Wrong port configuration
- Firewall blocking connection
- Ollama not installed

### 3. "Vector database unavailable"

**Problem**: Cannot connect to Qdrant vector database.

**Solutions**:
```bash
# Check Qdrant status
curl http://localhost:6333/health

# Use fallback storage
code-review config --set "vectorDB.provider" "fallback"

# Verify Qdrant configuration
code-review config --get "vectorDB.url"
```

**Fallback Mode**: The system automatically falls back to file-based storage when Qdrant is unavailable.

### 4. "Git hooks not working"

**Problem**: Git hooks are not executing automatically.

**Solutions**:
```bash
# Reinstall hooks
code-review init --hooks --force

# Check hook permissions
ls -la .git/hooks/
chmod +x .git/hooks/post-commit
chmod +x .git/hooks/post-merge

# Verify hook installation
cat .git/hooks/post-commit
```

**Manual Verification**:
```bash
# Test post-commit hook manually
.git/hooks/post-commit

# Check Git hook configuration
git config --get core.hooksPath
```

## Error Messages

### Configuration Errors

#### "Configuration validation failed"

**Error**: Configuration file contains invalid settings.

**Solutions**:
```bash
# Show current configuration
code-review config --show

# Validate configuration
code-review config --validate

# Reset to defaults
code-review config --reset

# Check specific values
code-review config --get "llm.provider"
code-review config --get "vectorDB.url"
```

#### "Configuration file not found"

**Error**: The system cannot locate the configuration file.

**Solutions**:
```bash
# Check if system is initialized
ls -la .code_review/

# Reinitialize if needed
code-review init

# Check file permissions
ls -la .code_review/config/
```

### LLM Service Errors

#### "Failed to list models"

**Error**: Cannot retrieve available models from Ollama.

**Solutions**:
```bash
# Check Ollama service
ollama list

# Restart Ollama
pkill ollama
ollama serve

# Check network connectivity
curl -v http://localhost:11434/api/tags

# Verify model exists
ollama pull mistral:7b-instruct
```

#### "Generation failed"

**Error**: LLM text generation failed.

**Solutions**:
```bash
# Check model availability
ollama list

# Pull required model
ollama pull mistral:7b-instruct

# Check system resources
free -h
nvidia-smi  # if using GPU

# Restart Ollama with more memory
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

### Vector Database Errors

#### "Failed to create collection"

**Error**: Cannot create vector database collections.

**Solutions**:
```bash
# Check Qdrant status
curl http://localhost:6333/collections

# Verify Qdrant configuration
code-review config --get "vectorDB.url"

# Use fallback storage
code-review config --set "vectorDB.provider" "fallback"

# Check Qdrant logs
docker logs qdrant  # if using Docker
```

#### "Connection failed"

**Error**: Cannot establish connection to vector database.

**Solutions**:
```bash
# Test connection
curl http://localhost:6333/health

# Check firewall settings
sudo ufw status

# Verify port availability
netstat -tlnp | grep 6333

# Restart Qdrant service
sudo systemctl restart qdrant
```

## Performance Issues

### Slow Review Generation

**Problem**: Reviews take too long to generate.

**Solutions**:
```bash
# Use smaller model
code-review config --set "llm.model" "mistral:7b-instruct"

# Reduce token limit
code-review config --set "llm.maxTokens" "1024"

# Enable deep mode only when needed
code-review review --since HEAD~1  # instead of --deep
```

**Optimization Tips**:
- Use smaller LLM models for faster inference
- Limit the number of files reviewed at once
- Use incremental indexing instead of full re-indexing
- Enable caching for repeated reviews

### High Memory Usage

**Problem**: System consumes too much memory.

**Solutions**:
```bash
# Check memory usage
htop
free -h

# Restart services
pkill ollama
ollama serve

# Use fallback storage
code-review config --set "vectorDB.provider" "fallback"
```

**Memory Management**:
- Process files in smaller batches
- Use streaming for large files
- Implement proper cleanup after operations
- Monitor memory usage during indexing

### Slow Indexing

**Problem**: Repository indexing takes too long.

**Solutions**:
```bash
# Limit commit range
code-review index-history --since HEAD~100

# Skip deep analysis
code-review index-history --limit 50

# Use background indexing
code-review index-history --background
```

**Indexing Optimization**:
- Index only recent commits initially
- Use incremental indexing for new commits
- Skip large binary files
- Process commits in parallel

## Configuration Problems

### Environment Variables Not Working

**Problem**: Environment variables are not being read.

**Solutions**:
```bash
# Check environment variables
env | grep -i ollama
env | grep -i anthropic

# Set variables explicitly
export OLLAMA_BASE_URL=http://localhost:11434
export ANTHROPIC_API_KEY=your-key

# Use .env file
echo "OLLAMA_BASE_URL=http://localhost:11434" > .env
source .env
```

**Common Issues**:
- Variables not exported in current shell
- Wrong variable names
- Missing .env file
- Shell configuration issues

### Configuration File Corruption

**Problem**: Configuration file is corrupted or unreadable.

**Solutions**:
```bash
# Backup current config
cp .code_review/config/config.json config.backup

# Reset to defaults
code-review config --reset

# Restore from backup if needed
cp config.backup .code_review/config/config.json

# Validate configuration
code-review config --validate
```

**Prevention**:
- Regular configuration backups
- Use version control for configuration
- Validate configuration after changes
- Test configuration in staging environment

## Integration Issues

### Git Hooks Not Triggering

**Problem**: Git hooks are not executing on Git operations.

**Solutions**:
```bash
# Verify hook installation
ls -la .git/hooks/

# Check hook permissions
chmod +x .git/hooks/post-commit
chmod +x .git/hooks/post-merge

# Test hook manually
.git/hooks/post-commit

# Reinstall hooks
code-review init --hooks --force
```

**Debugging**:
```bash
# Enable Git debug mode
GIT_TRACE=1 git commit -m "test"

# Check Git hook logs
tail -f .code_review/logs/git-hooks.log

# Verify hook script content
cat .git/hooks/post-commit
```

### Editor Integration Issues

**Problem**: Cannot edit configuration in preferred editor.

**Solutions**:
```bash
# Set default editor
export EDITOR=vim
export VISUAL=code

# Use specific editor
EDITOR=nano code-review config --edit

# Edit manually
code-review config --show > config.tmp
vim config.tmp
code-review config --import config.tmp
```

**Supported Editors**:
- VS Code: `code`
- Vim: `vim`
- Nano: `nano`
- Emacs: `emacs`

## FAQ

### General Questions

#### Q: What is the difference between local and cloud LLM modes?

**A**: 
- **Local Mode**: Uses Ollama for fast, offline reviews with no API costs
- **Cloud Mode**: Uses Anthropic Claude for more sophisticated analysis with API costs
- **Escalation**: Automatically switches to cloud mode for complex reviews

#### Q: How do I switch between different LLM models?

**A**:
```bash
# List available Ollama models
ollama list

# Switch to different model
code-review config --set "llm.model" "codellama:7b"

# Pull new model if needed
ollama pull codellama:7b
```

#### Q: Can I use the system without Ollama?

**A**: Yes, you can use cloud-only mode:
```bash
code-review config --set "llm.provider" "anthropic"
code-review config --set "llm.model" "claude-3-sonnet-20240229"
```

### Performance Questions

#### Q: How can I speed up the review process?

**A**:
- Use smaller LLM models
- Limit the scope of reviews
- Enable caching
- Use incremental indexing
- Process files in parallel

#### Q: What affects indexing performance?

**A**:
- Repository size and history
- LLM model complexity
- Vector database performance
- System resources (CPU, memory)
- Network latency (for cloud services)

#### Q: How much memory does the system use?

**A**: Memory usage depends on:
- LLM model size (1-8GB for Ollama models)
- Repository size and indexing depth
- Vector database storage
- Concurrent operations

### Configuration Questions

#### Q: Where are configuration files stored?

**A**: Configuration is stored in `.code_review/config/config.json` relative to your repository root.

#### Q: Can I use different configurations for different projects?

**A**: Yes, each repository has its own configuration. You can also use environment variables for global settings.

#### Q: How do I backup my configuration?

**A**:
```bash
# Export configuration
code-review config --export config.backup

# Import configuration
code-review config --import config.backup

# Version control
git add .code_review/config/
git commit -m "Update code review configuration"
```

### Troubleshooting Questions

#### Q: How do I enable debug logging?

**A**:
```bash
# Set log level
export LOG_LEVEL=debug

# Enable verbose mode
code-review --verbose

# Check log files
tail -f .code_review/logs/app.log
```

#### Q: What should I do if tests fail?

**A**:
1. Check system requirements
2. Verify service availability
3. Check configuration
4. Review error logs
5. Run tests individually
6. Check for environment issues

#### Q: How do I reset the system to a clean state?

**A**:
```bash
# Remove configuration
rm -rf .code_review/

# Reinitialize
code-review init

# Reset configuration
code-review config --reset
```

## Getting Help

### Self-Service Resources

1. **Documentation**: Check this troubleshooting guide and API reference
2. **Logs**: Review log files in `.code_review/logs/`
3. **Configuration**: Validate your configuration with `code-review config --validate`
4. **Status**: Check system status with `code-review status --verbose`

### Community Support

- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share solutions
- **Wiki**: Community-maintained documentation
- **Examples**: Check the examples directory for usage patterns

### Professional Support

For enterprise users or complex issues:
- **Priority Support**: Available for enterprise customers
- **Custom Integration**: Professional services for custom deployments
- **Training**: On-site training and workshops

## Prevention Tips

### Regular Maintenance

1. **Monitor Logs**: Regularly check log files for errors
2. **Update Dependencies**: Keep Ollama models and system packages updated
3. **Backup Configuration**: Version control your configuration files
4. **Test Regularly**: Run tests to catch issues early

### Best Practices

1. **Start Small**: Begin with small repositories and simple configurations
2. **Incremental Adoption**: Gradually enable advanced features
3. **Monitor Resources**: Watch system resource usage
4. **Document Changes**: Keep track of configuration changes
5. **Test Changes**: Validate changes in staging environment

### Performance Monitoring

1. **Response Times**: Monitor review generation times
2. **Resource Usage**: Track CPU, memory, and disk usage
3. **Error Rates**: Monitor failure rates and error patterns
4. **User Experience**: Gather feedback on review quality and speed

---

**Remember**: Most issues can be resolved by checking the logs, validating configuration, and ensuring all required services are running. When in doubt, start with `code-review status --verbose` to get a comprehensive system overview.
