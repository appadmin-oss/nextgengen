<?php
/**
 * The client bootstrap config, under a name a host firewall leaves alone.
 *
 * Shared-host web application firewalls (mod_security rule sets) refuse any
 * request for a path ending in `config.php` as an attempt on a configuration
 * file — this host answered /api/public/config.php with 403 before PHP ran. The
 * SPA could then never learn that an image cloud was configured, and every
 * photo fell back to travelling inline. Same response, same code: this file
 * only runs the original. public/config.php stays for older bundles.
 */
require __DIR__ . '/config.php';
