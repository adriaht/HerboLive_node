module.exports = (config, PlantsModel, External) => {
    const express = require('express');
    const router = express.Router();
    
    // GET /api/plants?query=...
    router.get('/', async (req, res) => {
        const query = req.query.query || '';
        try {
            let results = [];
            
            if (config.useDbFirst) {
                results = await PlantsModel.search(query, config.csvMaxRead);
                if (results.length > 0) return res.json(results);
            }

            results = await External.searchCSV(query);
            res.json(results.slice(0, config.csvMaxRead));
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al obtener plantas' });
        }
    });

    return router;
};
